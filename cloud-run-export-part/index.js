const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 8080;

// Variables de entorno para Google Drive (preparadas para fase 2)
const ROOT_DRIVE_FOLDER_ID = process.env.ROOT_DRIVE_FOLDER_ID;

// Advertencia si falta la configuración de Drive
if (!ROOT_DRIVE_FOLDER_ID) {
  console.warn('⚠️  WARNING: ROOT_DRIVE_FOLDER_ID no está configurado. La subida a Drive no funcionará.');
}

// Middleware
app.use(cors()); // Permitir llamadas desde cualquier origen (ajustar en producción)
app.use(express.json()); // Parsear JSON en el body

// Inicializar Google Drive API
async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

// Función para descargar imagen desde URL
async function downloadImage(imageUrl) {
  console.log(`📥 Descargando imagen desde: ${imageUrl.substring(0, 80)}...`);
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Error al descargar imagen: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`✅ Imagen descargada: ${buffer.length} bytes`);
  return buffer;
}

// Función para buscar o crear carpeta en Drive
async function findOrCreateFolder(drive, folderName, parentId) {
  console.log(`📁 Buscando/creando carpeta: "${folderName}" en parent: ${parentId}`);
  
  // Buscar carpeta existente
  const query = `name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchResponse = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    spaces: 'drive',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'drive',
    driveId: ROOT_DRIVE_FOLDER_ID
  });

  if (searchResponse.data.files && searchResponse.data.files.length > 0) {
    const folderId = searchResponse.data.files[0].id;
    console.log(`✅ Carpeta existente encontrada: ${folderId}`);
    return folderId;
  }

  // Crear nueva carpeta
  console.log(`📁 Creando nueva carpeta: "${folderName}"`);
  const folderMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const folder = await drive.files.create({
    requestBody: folderMetadata,
    fields: 'id',
    supportsAllDrives: true
  });

  console.log(`✅ Carpeta creada: ${folder.data.id}`);
  return folder.data.id;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Servicio exportar partes a Drive (MRD) OK');
});

// Endpoint principal para exportar partes
app.post('/export-part-to-drive', async (req, res) => {
  try {
    // 1. Extraer datos del body
    const {
      documentId,
      storagePath,
      imageUrl,
      carpetaDrive,
      obra,
      parteNumero,
      cliente,
      fecha
    } = req.body;

    // 2. Validar campos obligatorios
    if (!imageUrl || !carpetaDrive) {
      console.error('❌ Validación fallida: faltan campos obligatorios');
      return res.status(400).json({
        success: false,
        error: 'Falta imageUrl o carpetaDrive'
      });
    }

    // 3. Log del payload recibido
    console.log('📦 Payload recibido:', {
      documentId,
      storagePath,
      imageUrl: imageUrl.substring(0, 50) + '...',
      carpetaDrive,
      obra,
      parteNumero,
      cliente,
      fecha
    });

    // 4. Inicializar cliente de Google Drive
    console.log('🔑 Inicializando Google Drive API...');
    const drive = await getDriveClient();

    // 5. Buscar o crear carpeta según carpetaDrive
    const folderId = await findOrCreateFolder(drive, carpetaDrive, ROOT_DRIVE_FOLDER_ID);

    // 6. Descargar imagen desde imageUrl
    const imageBuffer = await downloadImage(imageUrl);

    // 7. Generar nombre de archivo
    const fileName = `Parte_${parteNumero}_${fecha}.jpg`;
    console.log(`📝 Nombre de archivo: ${fileName}`);

    // 8. Subir archivo a Google Drive
    console.log('☁️  Subiendo archivo a Google Drive...');
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: 'image/jpeg',
      body: Readable.from(imageBuffer)
    };

    const driveFile = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, name',
      supportsAllDrives: true
    });

    console.log('✅ Archivo subido exitosamente a Drive');
    console.log(`📄 ID: ${driveFile.data.id}, Nombre: ${fileName}`);

    // 9. Respuesta de éxito
    res.status(200).json({
      success: true,
      message: 'Parte exportado correctamente a Google Drive.'
    });

  } catch (error) {
    console.error('❌ Error en /export-part-to-drive:', error);
    if (error.response?.data) {
      console.error('📋 Detalles del error de Google API:', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: error.message
    });
  }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint no encontrado'
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
  console.log(`📁 ROOT_DRIVE_FOLDER_ID: ${ROOT_DRIVE_FOLDER_ID || 'NO CONFIGURADO'}`);
});
