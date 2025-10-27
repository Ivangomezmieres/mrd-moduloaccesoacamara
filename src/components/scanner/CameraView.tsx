import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCamera } from '@/hooks/useCamera';
import {
  waitForOpenCV,
  detectDocumentEdges,
  isDocumentWellFramed,
  drawDocumentOverlay,
  processDocument,
  DocumentCorners
} from '@/lib/opencv-utils';

interface CameraViewProps {
  onCapture: (imageData: string) => void;
}

const CameraView = ({ onCapture }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const { stream, error, isLoading: isCameraLoading } = useCamera();
  const [isOpenCVReady, setIsOpenCVReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCorners, setDetectedCorners] = useState<DocumentCorners | null>(null);
  const [isWellFramed, setIsWellFramed] = useState(false);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    waitForOpenCV().then(() => {
      setIsOpenCVReady(true);
      toast.success('Sistema de detección listo');
    });
  }, []);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const processFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !overlayCanvasRef.current || !isOpenCVReady) {
      animationFrameRef.current = requestAnimationFrame(processFrame);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;

      // Detect document edges
      const corners = detectDocumentEdges(video, canvas);
      
      if (corners) {
        const wellFramed = isDocumentWellFramed(corners, canvas.width, canvas.height);
        setDetectedCorners(corners);
        setIsWellFramed(wellFramed);

        // Draw overlay
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
          drawDocumentOverlay(overlayCanvas, corners, wellFramed);
        }
      } else {
        setDetectedCorners(null);
        setIsWellFramed(false);
        
        // Clear overlay
        const ctx = overlayCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(processFrame);
  }, [isOpenCVReady]);

  useEffect(() => {
    if (stream && isOpenCVReady) {
      processFrame();
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [stream, isOpenCVReady, processFrame]);

  const handleCapture = async () => {
    if (!detectedCorners) {
      toast.error('No se ha detectado ningún documento');
      return;
    }

    setIsProcessing(true);

    try {
      // Capture current frame
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      
      if (!video) throw new Error('Video not available');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) throw new Error('Cannot get canvas context');

      ctx.drawImage(video, 0, 0);

      // Create image element from canvas
      const img = new Image();
      img.src = canvas.toDataURL('image/jpeg');

      await new Promise((resolve) => {
        img.onload = resolve;
      });

      // Process document
      const processedImage = processDocument(img, detectedCorners);
      onCapture(processedImage);
      
      toast.success('Documento capturado');
    } catch (error) {
      console.error('Error capturing document:', error);
      toast.error('Error al procesar el documento');
    } finally {
      setIsProcessing(false);
    }
  };

  if (isCameraLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-muted-foreground">Iniciando cámara...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[70vh] space-y-4">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-[3/4] max-h-[70vh]">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <canvas
          ref={canvasRef}
          className="hidden"
        />
        <canvas
          ref={overlayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
        
        {!isOpenCVReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center text-white">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">Cargando detector...</p>
            </div>
          </div>
        )}

        {isOpenCVReady && (
          <div className="absolute top-4 left-4 right-4">
            <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
              detectedCorners 
                ? isWellFramed 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-yellow-500 text-white'
                : 'bg-muted text-muted-foreground'
            }`}>
              {detectedCorners 
                ? isWellFramed 
                  ? '✓ Documento detectado - Listo para capturar' 
                  : 'Ajusta el encuadre'
                : 'Apunta a un documento'}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button
          onClick={handleCapture}
          disabled={!detectedCorners || isProcessing}
          className="flex-1"
          size="lg"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <Camera className="mr-2 h-5 w-5" />
              Capturar
            </>
          )}
        </Button>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>Posiciona el documento dentro del marco verde</p>
        <p>La captura se optimizará automáticamente</p>
      </div>
    </div>
  );
};

export default CameraView;
