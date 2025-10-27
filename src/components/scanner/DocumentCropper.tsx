import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, RotateCcw, Check } from 'lucide-react';
import { toast } from 'sonner';
import { detectDocumentEdges, cropAndStraighten, waitForOpenCV, DocumentCorners } from '@/lib/opencv-utils';

interface DocumentCropperProps {
  imageData: string;
  onContinue: (croppedImageData: string) => void;
  onCancel: () => void;
}

const DocumentCropper = ({ imageData, onContinue, onCancel }: DocumentCropperProps) => {
  const [corners, setCorners] = useState<DocumentCorners | null>(null);
  const [draggingCorner, setDraggingCorner] = useState<keyof DocumentCorners | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize corners when image loads
  useEffect(() => {
    const img = new Image();
    img.onload = async () => {
      imageRef.current = img;
      setImageSize({ width: img.width, height: img.height });

      // Wait for OpenCV and try automatic detection
      await waitForOpenCV();
      
      // Create a temporary canvas for detection
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const ctx = tempCanvas.getContext('2d');
      
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        
        // Create a temporary video element for detectDocumentEdges
        const tempVideo = document.createElement('video');
        tempVideo.width = img.width;
        tempVideo.height = img.height;
        
        // Try to detect document edges
        const detected = detectDocumentEdges(tempVideo, tempCanvas);
        
        if (detected) {
          setCorners(detected);
        } else {
          // Default: 5% margin from edges
          const margin = 0.05;
          setCorners({
            topLeft: { x: img.width * margin, y: img.height * margin },
            topRight: { x: img.width * (1 - margin), y: img.height * margin },
            bottomRight: { x: img.width * (1 - margin), y: img.height * (1 - margin) },
            bottomLeft: { x: img.width * margin, y: img.height * (1 - margin) }
          });
        }
      }
    };
    img.src = imageData;
  }, [imageData]);

  // Draw image and overlay
  useEffect(() => {
    if (!canvasRef.current || !imageRef.current || !corners) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw image
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);

    // Calculate scale factor
    const scaleX = canvas.width / imageSize.width;
    const scaleY = canvas.height / imageSize.height;

    // Draw overlay
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';

    // Draw connecting lines
    ctx.beginPath();
    ctx.moveTo(corners.topLeft.x * scaleX, corners.topLeft.y * scaleY);
    ctx.lineTo(corners.topRight.x * scaleX, corners.topRight.y * scaleY);
    ctx.lineTo(corners.bottomRight.x * scaleX, corners.bottomRight.y * scaleY);
    ctx.lineTo(corners.bottomLeft.x * scaleX, corners.bottomLeft.y * scaleY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Draw corner handles
    const drawCornerHandle = (x: number, y: number) => {
      ctx.fillStyle = '#3B82F6';
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x * scaleX, y * scaleY, 12, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    };

    drawCornerHandle(corners.topLeft.x, corners.topLeft.y);
    drawCornerHandle(corners.topRight.x, corners.topRight.y);
    drawCornerHandle(corners.bottomRight.x, corners.bottomRight.y);
    drawCornerHandle(corners.bottomLeft.x, corners.bottomLeft.y);
  }, [corners, imageSize]);

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = ((clientX - rect.left) / rect.width) * imageSize.width;
    const y = ((clientY - rect.top) / rect.height) * imageSize.height;
    
    return { x, y };
  };

  const findNearestCorner = (x: number, y: number): keyof DocumentCorners | null => {
    if (!corners) return null;

    const threshold = 30; // pixels
    const distances: { corner: keyof DocumentCorners; distance: number }[] = [
      { corner: 'topLeft', distance: Math.hypot(corners.topLeft.x - x, corners.topLeft.y - y) },
      { corner: 'topRight', distance: Math.hypot(corners.topRight.x - x, corners.topRight.y - y) },
      { corner: 'bottomRight', distance: Math.hypot(corners.bottomRight.x - x, corners.bottomRight.y - y) },
      { corner: 'bottomLeft', distance: Math.hypot(corners.bottomLeft.x - x, corners.bottomLeft.y - y) }
    ];

    const nearest = distances.sort((a, b) => a.distance - b.distance)[0];
    return nearest.distance < threshold ? nearest.corner : null;
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    const nearestCorner = findNearestCorner(coords.x, coords.y);
    if (nearestCorner) {
      setDraggingCorner(nearestCorner);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!draggingCorner || !corners) return;
    e.preventDefault();

    const coords = getCanvasCoordinates(e);
    if (!coords) return;

    // Clamp to image boundaries
    const clampedX = Math.max(0, Math.min(imageSize.width, coords.x));
    const clampedY = Math.max(0, Math.min(imageSize.height, coords.y));

    setCorners({
      ...corners,
      [draggingCorner]: { x: clampedX, y: clampedY }
    });
  };

  const handlePointerUp = () => {
    setDraggingCorner(null);
  };

  const handleUseOriginal = () => {
    setIsProcessing(true);
    setTimeout(() => {
      onContinue(imageData);
      setIsProcessing(false);
    }, 100);
  };

  const handleCropAndContinue = async () => {
    if (!corners || !imageRef.current) {
      toast.error('No se han definido las esquinas');
      return;
    }

    setIsProcessing(true);

    try {
      const croppedImage = cropAndStraighten(imageRef.current, corners);
      onContinue(croppedImage);
      toast.success('Documento recortado correctamente');
    } catch (error) {
      console.error('Error cropping document:', error);
      toast.error('Error al recortar el documento');
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    if (!imageSize.width || !imageSize.height) return;
    
    const margin = 0.05;
    setCorners({
      topLeft: { x: imageSize.width * margin, y: imageSize.height * margin },
      topRight: { x: imageSize.width * (1 - margin), y: imageSize.height * margin },
      bottomRight: { x: imageSize.width * (1 - margin), y: imageSize.height * (1 - margin) },
      bottomLeft: { x: imageSize.width * margin, y: imageSize.height * (1 - margin) }
    });
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">Ajustar Recorte</h3>
          <p className="text-sm text-muted-foreground">
            Arrastra las esquinas para ajustar el área del documento
          </p>
        </div>

        <div ref={containerRef} className="relative touch-none">
          <canvas
            ref={canvasRef}
            width={imageSize.width}
            height={imageSize.height}
            className="w-full rounded-lg cursor-move"
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            className="flex-1"
          >
            Volver
          </Button>
          
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isProcessing}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={handleUseOriginal}
            disabled={isProcessing}
            className="flex-1"
          >
            Usar Original
          </Button>

          <Button
            onClick={handleCropAndContinue}
            disabled={!corners || isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Continuar
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default DocumentCropper;
