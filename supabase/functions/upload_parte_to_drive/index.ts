import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// IMPLEMENTACIÓN COMPLETA DE AUTENTICACIÓN GOOGLE
// ============================================

// Codificar a Base64URL (sin padding)
function base64UrlEncode(data: Uint8Array | string): string {
  const base64 = typeof data === 'string' 
    ? btoa(data)
    : btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Convertir PEM a formato binario para crypto.subtle
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Limpiar el PEM: quitar headers y saltos de línea
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
    .replace(/-----END RSA PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  
  // Decodificar base64 a binario
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  // Importar la clave para usar con RS256
  return await crypto.subtle.importKey(
    'pkcs8',
    bytes,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

// Generar JWT firmado con RS256
async function createSignedJwt(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  // Header JWT
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };
  
  // Claims/Payload
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, // Expira en 1 hora
    iat: now,
  };
  
  // Codificar header y payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(claims));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  
  // Importar clave privada y firmar
  const cryptoKey = await importPrivateKey(privateKey);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(unsignedToken)
  );
  
  // Codificar firma
  const encodedSignature = base64UrlEncode(new Uint8Array(signature));
  
  return `${unsignedToken}.${encodedSignature}`;
}

// Obtener Access Token de Google usando Service Account
async function getGoogleAccessToken(): Promise<string> {
  console.log('[Auth] Iniciando autenticación con Google...');
  
  const clientEmail = Deno.env.get('GOOGLE_CLIENT_EMAIL');
  let privateKey = Deno.env.get('GOOGLE_PRIVATE_KEY');
  
  if (!clientEmail || !privateKey) {
    throw new Error('Credenciales de Google no configuradas (GOOGLE_CLIENT_EMAIL o GOOGLE_PRIVATE_KEY)');
  }
  
  // Manejar saltos de línea en la clave privada (pueden venir como \n literal)
  privateKey = privateKey.replace(/\\n/g, '\n');
  
  console.log('[Auth] Credenciales cargadas, generando JWT...');
  
  // Crear JWT firmado con RS256
  const signedJwt = await createSignedJwt(clientEmail, privateKey);
  
  console.log('[Auth] JWT generado, intercambiando por access token...');
  
  // Intercambiar JWT por Access Token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signedJwt,
    }),
  });
  
  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok || !tokenData.access_token) {
    console.error('[Auth] Error obteniendo access token:', tokenData);
    throw new Error(`Error de autenticación con Google: ${tokenData.error_description || tokenData.error || 'Unknown error'}`);
  }
  
  console.log('[Auth] Access token obtenido correctamente');
  return tokenData.access_token;
}

// ============================================
// FUNCIÓN PRINCIPAL
// ============================================

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Parsear y validar request body
    const { obra_id, parte_id, storage_path, nombre_archivo, target_drive_folder_id } = await req.json();
    
    console.log('[Request] Recibido:', { 
      obra_id, 
      parte_id, 
      storage_path, 
      nombre_archivo, 
      target_drive_folder_id 
    });
    
    // Validar parámetros requeridos
    if (!storage_path || !nombre_archivo) {
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          message: 'Parámetros requeridos: storage_path y nombre_archivo' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 2. Determinar carpeta destino con VALIDACIÓN
    const folderId = target_drive_folder_id || Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    
    // ⚠️ VALIDACIÓN: Si folderId es null o vacío, devolver error
    if (!folderId || folderId.trim() === '') {
      console.error('[Error] No se especificó carpeta destino y GOOGLE_DRIVE_ROOT_FOLDER_ID no está configurado');
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          message: 'No se ha especificado una carpeta de destino en Drive. Configure target_drive_folder_id o la variable GOOGLE_DRIVE_ROOT_FOLDER_ID.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[Config] Carpeta destino en Drive:', folderId);
    console.log('[Info] Procesando parte:', { obra_id, parte_id }); // Solo logs, sin DB
    
    // 3. Crear cliente Supabase con service role para acceso completo al Storage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // 4. Descargar archivo de Supabase Storage (bucket: scans)
    console.log('[Storage] Descargando archivo:', storage_path);
    
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('scans')
      .download(storage_path);
    
    if (downloadError || !fileData) {
      console.error('[Storage] Error descargando:', downloadError);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          message: `Error descargando archivo de Storage: ${downloadError?.message || 'Archivo no encontrado'}` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[Storage] Archivo descargado, tamaño:', fileData.size, 'bytes');
    
    // 5. Obtener access token de Google (autenticación completa RS256)
    const accessToken = await getGoogleAccessToken();
    
    // 6. Determinar MIME type basado en extensión
    let mimeType = 'application/octet-stream';
    const lowerPath = storage_path.toLowerCase();
    if (lowerPath.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) {
      mimeType = 'image/jpeg';
    } else if (lowerPath.endsWith('.png')) {
      mimeType = 'image/png';
    } else if (lowerPath.endsWith('.webp')) {
      mimeType = 'image/webp';
    }
    
    console.log('[Drive] Preparando subida:', { nombre_archivo, mimeType, folderId });
    
    // 7. Subir a Google Drive usando Multipart Upload
    const metadata = {
      name: nombre_archivo,
      parents: [folderId],
    };
    
    // Log explícito para confirmar configuración de Shared Drive
    console.log('[Drive] Configuración de subida a Shared Drive:', {
      folderId: folderId,
      parents: metadata.parents,
      supportsAllDrives: true,
      nombre_archivo: nombre_archivo,
    });
    
    // Crear FormData para multipart upload
    const form = new FormData();
    form.append(
      'metadata', 
      new Blob([JSON.stringify(metadata)], { type: 'application/json' })
    );
    form.append('file', fileData, nombre_archivo);
    
    const uploadResponse = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,name',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        body: form,
      }
    );
    
    const uploadResult = await uploadResponse.json();
    
    if (!uploadResponse.ok || !uploadResult.id) {
      console.error('[Drive] Error en subida:', uploadResult);
      return new Response(
        JSON.stringify({ 
          status: 'error', 
          message: `Error subiendo archivo a Drive: ${uploadResult.error?.message || JSON.stringify(uploadResult)}` 
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[Drive] Archivo subido exitosamente:', {
      id: uploadResult.id,
      name: uploadResult.name,
      url: uploadResult.webViewLink,
    });
    
    // 8. Log final con obra_id y parte_id (sin insertar en DB por ahora)
    console.log('[Success] Parte procesado:', {
      obra_id,
      parte_id,
      drive_file_id: uploadResult.id,
      drive_url: uploadResult.webViewLink,
    });
    
    // 9. Respuesta exitosa
    return new Response(
      JSON.stringify({
        status: 'ok',
        drive_file_id: uploadResult.id,
        drive_url: uploadResult.webViewLink,
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error) {
    console.error('[Error] Error no controlado:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: errorMessage
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
