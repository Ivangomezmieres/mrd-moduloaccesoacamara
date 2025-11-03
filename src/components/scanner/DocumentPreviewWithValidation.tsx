import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { 
  waitForOpenCV, 
  detectDocumentEdgesFromImage, 
  cropAndStraighten, 
  downscaleImage,
  type DocumentCorners 
} from '@/lib/opencv-utils';

type ProcessingStage = 
  | 'initializing'
  | 'detecting'
  | 'cropping'
  | 'validating'
  | 'saving'
  | 'success'
  | 'failed';

interface DocumentPreviewWithValidationProps {
  imageData: string;
  userId: string;
  onRetake: () => void;
  onSuccess: () => void;
}

const DocumentPreviewWithValidation = ({ 
  imageData, 
  userId, 
  onRetake, 
  onSuccess 
}: DocumentPreviewWithValidationProps) => {
  const [stage, setStage] = useState<ProcessingStage>('initializing');
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [validationScore, setValidationScore] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [hadAutoCrop, setHadAutoCrop] = useState<boolean>(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    processDocument();
    
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const processDocument = async () => {
    try {
      if (!mountedRef.current) return;
      
      // FASE 1: Inicializar OpenCV
      setStage('initializing');
      await waitForOpenCV();
      
      if (!mountedRef.current) return;
      
      // FASE 2: Cargar imagen
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = imageData;
      });
      
      if (!mountedRef.current) return;
      
      // FASE 3: Downscale defensivo para detección (evitar OOM)
      let workingImage = imageData;
      if (img.width > 1920 || img.height > 1920) {
        workingImage = downscaleImage(img, 1920);
        // Recargar imagen downscaled
        img.src = workingImage;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
        });
      }
      
      if (!mountedRef.current) return;
      
      // FASE 4: Detectar bordes automáticamente con OpenCV (umbrales mejorados)
      setStage('detecting');
      const detectedCorners = await detectDocumentEdgesFromImage(img);
      
      if (!mountedRef.current) return;
      
      let finalImage = workingImage;
      
      // FASE 5: Recortar y enderezar si se detectaron bordes
      if (detectedCorners) {
        setStage('cropping');
        setHadAutoCrop(true);
        try {
          finalImage = cropAndStraighten(img, detectedCorners, {
            autoEnhance: true,
            outputQuality: 0.95  // Aumentada calidad de 0.92 a 0.95
          });
          console.log('Documento detectado y procesado con OpenCV');
        } catch (error) {
          console.warn('Error extrayendo documento, usando imagen original:', error);
          finalImage = workingImage;
          setHadAutoCrop(false);
        }
      } else {
        console.log('No se detectaron bordes, usando imagen original');
        setHadAutoCrop(false);
        // Downscale final para guardar
        if (img.width > 2200 || img.height > 2200) {
          finalImage = downscaleImage(img, 2200);
        }
      }
      
      if (!mountedRef.current) return;
      setProcessedImage(finalImage);
      
      // FASE 6: Validar legibilidad con AI
      setStage('validating');
      await validateAndSave(finalImage);
      
    } catch (error: any) {
      console.error('Error procesando documento:', error);
      if (mountedRef.current) {
        setStage('failed');
        setErrorMessage(error.message || 'Error desconocido al procesar');
        toast.error('Error al procesar el documento');
      }
    }
  };

  const validateAndSave = async (imageToValidate: string) => {
    try {
      if (!mountedRef.current) return;
      
      // Llamar a edge function para validación
      const { data: validation, error: validationError } = await supabase.functions.invoke(
        'validate-document',
        {
          body: { imageData: imageToValidate }
        }
      );

      if (validationError) throw validationError;
      if (!mountedRef.current) return;
      
      const score = validation.legibilityPercentage || 0;
      setValidationScore(score);
      
      // FASE 7: Guardar documento automáticamente
      setStage('saving');
      
      // Convertir base64 a blob
      const response = await fetch(imageToValidate);
      const blob = await response.blob();
      
      // Upload a storage
      const fileName = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;
      if (!mountedRef.current) return;

      // Guardar metadata en BD
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          storage_path: fileName,
          uploader: userId,
          status: 'pending',
          meta: {
            validationResult: validation,
            extractedData: validation.extractedData || null,
            legibilityScore: score,
            processedAt: new Date().toISOString(),
            hadAutoCrop
          }
        });

      if (dbError) throw dbError;
      if (!mountedRef.current) return;

      // Éxito
      setStage('success');
      toast.success('Documento procesado correctamente', {
        description: score >= 80 ? 'Datos extraídos automáticamente' : 'Algunos campos pueden requerir revisión'
      });
      
      // Volver a cámara después de 1 segundo
      setTimeout(() => {
        if (mountedRef.current) {
          onSuccess();
        }
      }, 1000);
      
    } catch (error: any) {
      console.error('Error en validación/guardado:', error);
      if (mountedRef.current) {
        setStage('failed');
        setErrorMessage(error.message || 'Error al validar o guardar');
        toast.error('Error al procesar el documento');
      }
    }
  };

  const getStatusMessage = () => {
    switch (stage) {
      case 'initializing':
        return 'Inicializando procesamiento...';
      case 'detecting':
        return 'Detectando bordes del documento...';
      case 'cropping':
        return 'Recortando y enderezando...';
      case 'validating':
        return 'Validando legibilidad con IA...';
      case 'saving':
        return 'Guardando documento...';
      case 'success':
        return `Documento procesado correctamente`;
      case 'failed':
        return errorMessage || 'Error al procesar el documento';
      default:
        return '';
    }
  };

  const isProcessing = ['initializing', 'detecting', 'cropping', 'validating', 'saving'].includes(stage);
  const showRetakeButton = stage === 'failed';

  return (
    <div className="flex flex-col h-[100dvh] w-full bg-background">
      {/* Header fijo */}
      <div className="flex-shrink-0 border-b p-4 bg-card">
        <h2 className="text-lg font-semibold">Procesando documento</h2>
      </div>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-auto px-4 py-4">
        {/* Imagen */}
        <div className="relative bg-muted rounded-xl overflow-hidden mb-4 max-h-[50vh] flex items-center justify-center">
          <img
            src={processedImage || imageData}
            alt="Documento procesado"
            className="w-full h-full object-contain"
          />
        </div>

        {/* Estado de procesamiento */}
        <div className="space-y-3">
          {isProcessing && (
            <div className="flex items-center justify-center gap-3 py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm font-medium">{getStatusMessage()}</p>
            </div>
          )}

          {stage === 'success' && (
            <div className="flex items-center justify-center gap-3 py-4 text-green-600">
              <CheckCircle2 className="h-6 w-6" />
              <p className="text-sm font-medium">{getStatusMessage()}</p>
            </div>
          )}

          {stage === 'failed' && (
            <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">
                    Error al procesar el documento
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Por favor, intenta de nuevo con mejor iluminación y enfoque
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer fijo con CTA SIEMPRE VISIBLE */}
      <div className="flex-shrink-0 border-t p-4 bg-card">
        <Button
          variant={showRetakeButton ? 'destructive' : 'outline'}
          onClick={onRetake}
          disabled={!showRetakeButton && stage !== 'success'}
          className="w-full"
          size="lg"
        >
          <RotateCcw className="mr-2 h-5 w-5" />
          {showRetakeButton ? 'Repetir foto' : 'Procesando...'}
        </Button>
      </div>
    </div>
  );
};

export default DocumentPreviewWithValidation;
