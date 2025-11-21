const express = require('express');
const cors = require('cors');

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

    // 3. Log del payload recibido (para debugging en Cloud Run)
    console.log('📦 Payload recibido:', {
      documentId,
      storagePath,
      imageUrl: imageUrl.substring(0, 50) + '...', // Truncar URL larga
      carpetaDrive,
      obra,
      parteNumero,
      cliente,
      fecha
    });

    // TODO: FASE 2 - Implementar conexión con Google Drive
    // 1. Autenticación con service account de Cloud Run
    //    const auth = new google.auth.GoogleAuth({
    //      scopes: ['https://www.googleapis.com/auth/drive.file']
    //    });
    //    const drive = google.drive({ version: 'v3', auth });
    //
    // 2. Buscar o crear carpeta según carpetaDrive dentro de ROOT_DRIVE_FOLDER_ID
    //    const folderId = await findOrCreateFolder(carpetaDrive, ROOT_DRIVE_FOLDER_ID);
    //
    // 3. Descargar imagen desde imageUrl
    //    const imageBuffer = await downloadImage(imageUrl);
    //
    // 4. Generar nombre de archivo: Parte_${parteNumero}_${fecha}.jpg
    //    const fileName = `Parte_${parteNumero}_${fecha}.jpg`;
    //
    // 5. Subir archivo a Drive
    //    const driveFile = await drive.files.create({
    //      requestBody: {
    //        name: fileName,
    //        parents: [folderId]
    //      },
    //      media: {
    //        mimeType: 'image/jpeg',
    //        body: imageBuffer
    //      }
    //    });
    //
    // 6. Devolver URL del archivo en Drive
    //    const driveFileUrl = `https://drive.google.com/file/d/${driveFile.data.id}/view`;

    // 4. Respuesta de éxito (provisional)
    console.log('✅ Payload procesado correctamente');
    res.status(200).json({
      success: true,
      message: 'Payload recibido correctamente. Pendiente de implementar subida a Drive.',
      debug: {
        documentId,
        parteNumero,
        carpetaDrive
      }
    });

  } catch (error) {
    console.error('❌ Error en /export-part-to-drive:', error);
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
