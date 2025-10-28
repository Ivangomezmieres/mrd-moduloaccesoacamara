import { useRef, useState, useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { initJscanify, highlightDocument } from '@/lib/jscanify-utils';

interface CameraViewProps {
  onCapture: (imageData: string) => void;
}

const CameraView = ({ onCapture }: CameraViewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const highlightCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanner, setScanner] = useState<any>(null);
  const { stream, error: cameraError, isLoading: cameraLoading } = useCamera();

  // Inicializar jscanify
  useEffect(() => {
    initJscanify()
      .then(setScanner)
      .catch(err => console.warn('jscanify initialization failed:', err));
  }, []);

  // Highlighting en tiempo real
  useEffect(() => {
    if (!stream || !scanner || !videoRef.current || !highlightCanvasRef.current) return;
    
    let animationId: number;
    const tempCanvas = document.createElement('canvas');
    const highlightCanvas = highlightCanvasRef.current;
    
    const highlight = () => {
      if (!videoRef.current || !highlightCanvas) return;
      
      const video = videoRef.current;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        highlightCanvas.width = video.videoWidth;
        highlightCanvas.height = video.videoHeight;
        
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          highlightDocument(scanner, tempCanvas, highlightCanvas);
        }
      }
      
      animationId = requestAnimationFrame(highlight);
    };
    
    highlight();
    return () => cancelAnimationFrame(animationId);
  }, [stream, scanner]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const handleCapture = async () => {
    if (!videoRef.current) {
      toast.error('Cámara no disponible');
      return;
    }

    setIsProcessing(true);

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        throw new Error('No se pudo obtener el contexto del canvas');
      }

      // Capture current video frame directly
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // Return raw capture without processing
      const imageData = canvas.toDataURL('image/jpeg', 0.98);
      onCapture(imageData);
      toast.success('Foto capturada');
    } catch (error) {
      console.error('Error capturing photo:', error);
      toast.error('Error al capturar la foto');
    } finally {
      setIsProcessing(false);
    }
  };

  if (cameraLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Inicializando cámara...</p>
        </CardContent>
      </Card>
    );
  }

  if (cameraError) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive">{cameraError}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="relative">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full rounded-lg"
          />
          <canvas
            ref={highlightCanvasRef}
            className="absolute top-0 left-0 w-full h-full rounded-lg pointer-events-none"
            style={{ mixBlendMode: 'multiply' }}
          />
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleCapture}
            disabled={isProcessing}
            className="w-full"
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Capturando...
              </>
            ) : (
              <>
                <Camera className="mr-2 h-5 w-5" />
                Capturar Foto
              </>
            )}
          </Button>
        </div>

        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-medium">Consejos para mejor captura:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Coloca el documento en una superficie plana</li>
            <li>Asegúrate de tener buena iluminación</li>
            <li>Mantén la cámara paralela al documento</li>
            <li>Evita sombras sobre el documento</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default CameraView;
