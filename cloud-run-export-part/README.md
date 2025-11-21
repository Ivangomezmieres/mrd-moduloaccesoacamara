# Servicio Exportar Partes a Google Drive

Servicio HTTP desplegado en Google Cloud Run que actúa como puente entre la aplicación Lovable y Google Drive para exportar partes de trabajo.

## Arquitectura

```
[App Lovable] → [POST /export-part-to-drive] → [Cloud Run Service] → [Google Drive API]
```

## Variables de entorno

- `PORT`: Puerto donde escucha el servidor (default: 8080, Cloud Run lo configura automáticamente)
- `ROOT_DRIVE_FOLDER_ID`: ID de la carpeta raíz "Partes Obra 2025" en Google Drive

## Endpoints

### `GET /`
Health check del servicio.

**Respuesta**:
```
Servicio exportar partes a Drive (MRD) OK
```

### `POST /export-part-to-drive`
Recibe datos de un parte y lo exporta a Google Drive.

**Body (JSON)**:
```json
{
  "documentId": "uuid-del-documento",
  "storagePath": "ruta/en/supabase/storage",
  "imageUrl": "https://supabase.co/storage/...",
  "carpetaDrive": "ALUMAN",
  "obra": "TORRES DE COLON",
  "parteNumero": "01842",
  "cliente": "ALUMAN S.L.",
  "fecha": "2024-10-27"
}
```

**Respuesta de éxito (200)**:
```json
{
  "success": true,
  "message": "Parte exportado correctamente a Google Drive",
  "driveFileUrl": "https://drive.google.com/file/d/xxx/view"
}
```

**Respuesta de error (400)**:
```json
{
  "success": false,
  "error": "Falta imageUrl o carpetaDrive"
}
```

## Despliegue en Google Cloud Run

### Prerrequisitos

1. **Proyecto de Google Cloud**: `mrd-partes-drive`
2. **Service Account**: `mrd-partes-drive@mrd-partes-drive.iam.gserviceaccount.com` con:
   - Rol: `Cloud Run Invoker`
   - Rol: `Storage Admin` (si accede a Google Cloud Storage)
   - Acceso a Google Drive (configurar en Google Workspace)
3. **ID de carpeta Drive**: Obtener el ID de la carpeta "Partes Obra 2025"

### Obtener el ID de la carpeta de Drive

1. Abre Google Drive y navega a la carpeta "Partes Obra 2025"
2. La URL será: `https://drive.google.com/drive/folders/XXXXXXXXXXXXXXXXXX`
3. Copia el ID: `XXXXXXXXXXXXXXXXXX`

### Comandos de despliegue

#### 1. Autenticarse en Google Cloud

```bash
gcloud auth login
gcloud config set project mrd-partes-drive
```

#### 2. Construir y subir la imagen a Container Registry

Desde la raíz del proyecto:

```bash
cd cloud-run-export-part

gcloud builds submit --tag gcr.io/mrd-partes-drive/export-part-to-drive
```

#### 3. Desplegar en Cloud Run

```bash
gcloud run deploy export-part-to-drive \
  --image gcr.io/mrd-partes-drive/export-part-to-drive \
  --platform managed \
  --region europe-west1 \
  --service-account mrd-partes-drive@mrd-partes-drive.iam.gserviceaccount.com \
  --set-env-vars ROOT_DRIVE_FOLDER_ID=TU_ID_DE_CARPETA_AQUI \
  --allow-unauthenticated \
  --memory 512Mi \
  --timeout 60s
```

**Parámetros**:
- `--image`: Imagen Docker a desplegar
- `--region`: `europe-west1` (Bélgica, más cercana a España)
- `--service-account`: Service account con permisos de Drive
- `--set-env-vars`: Variables de entorno (ajustar `ROOT_DRIVE_FOLDER_ID`)
- `--allow-unauthenticated`: Permite llamadas HTTP sin autenticación
- `--memory`: 512Mi (suficiente para este servicio ligero)
- `--timeout`: 60s (tiempo máximo de ejecución)

#### 4. Obtener URL del servicio

```bash
gcloud run services describe export-part-to-drive \
  --region europe-west1 \
  --format 'value(status.url)'
```

La URL será algo como:
```
https://export-part-to-drive-XXXX-uc.a.run.app
```

#### 5. Configurar en Lovable

En tu proyecto de Lovable, añade la variable de entorno:

```
VITE_EXPORT_PART_TO_DRIVE_URL=https://export-part-to-drive-XXXX-uc.a.run.app/export-part-to-drive
```

### Actualizar el servicio

Para redesplegar después de cambios:

```bash
# Construir nueva imagen
gcloud builds submit --tag gcr.io/mrd-partes-drive/export-part-to-drive

# Redesplegar (usa el mismo comando deploy, actualizará el servicio)
gcloud run deploy export-part-to-drive \
  --image gcr.io/mrd-partes-drive/export-part-to-drive \
  --platform managed \
  --region europe-west1
```

### Ver logs del servicio

```bash
gcloud run services logs read export-part-to-drive \
  --region europe-west1 \
  --limit 50
```

O desde la consola web:
https://console.cloud.google.com/run/detail/europe-west1/export-part-to-drive/logs

## Desarrollo local

Para probar localmente:

```bash
cd cloud-run-export-part
npm install
PORT=8080 ROOT_DRIVE_FOLDER_ID=test npm start
```

Hacer una petición de prueba:

```bash
curl -X POST http://localhost:8080/export-part-to-drive \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "test-123",
    "storagePath": "test/path",
    "imageUrl": "https://example.com/image.jpg",
    "carpetaDrive": "TEST_FOLDER",
    "obra": "OBRA DE PRUEBA",
    "parteNumero": "00001",
    "cliente": "Cliente Test",
    "fecha": "2025-01-15"
  }'
```

## Próximos pasos (Fase 2)

1. **Añadir dependencia de Google Drive**:
   ```bash
   npm install googleapis
   ```

2. **Implementar autenticación con service account** (automática en Cloud Run)

3. **Implementar funciones auxiliares**:
   - `findOrCreateFolder(carpetaName, parentFolderId)`: Buscar o crear subcarpeta
   - `downloadImage(url)`: Descargar imagen desde URL
   - `uploadToDrive(fileBuffer, fileName, folderId)`: Subir archivo a Drive

4. **Configurar permisos en Google Workspace**:
   - Dar acceso a la service account a la carpeta "Partes Obra 2025"
   - Configurar domain-wide delegation si es necesario

5. **Opcional - Mejorar seguridad**:
   - Añadir autenticación con API Key o JWT
   - Validar que las peticiones vienen de tu dominio de Lovable
   - Rate limiting para evitar abuso

## Troubleshooting

### Error: "Permission denied"
- Verifica que la service account tenga acceso a la carpeta de Drive
- Comprueba que la carpeta esté compartida con `mrd-partes-drive@mrd-partes-drive.iam.gserviceaccount.com`

### Error: "ROOT_DRIVE_FOLDER_ID no configurado"
- Ejecuta el comando deploy con `--set-env-vars ROOT_DRIVE_FOLDER_ID=TU_ID`

### Error: "Failed to fetch" desde Lovable
- Verifica que el servicio esté desplegado con `--allow-unauthenticated`
- Comprueba que la URL en `VITE_EXPORT_PART_TO_DRIVE_URL` sea correcta

### Ver logs en tiempo real
```bash
gcloud run services logs tail export-part-to-drive --region europe-west1
```
