import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotateCcw, Check } from 'lucide-react';

interface DocumentPreviewProps {
  imageData: string;
  onRetake: () => void;
  onContinue: () => void;
}

const DocumentPreview = ({ imageData, onRetake, onContinue }: DocumentPreviewProps) => {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Vista previa del documento</h2>
        
        <div className="relative bg-muted rounded-lg overflow-hidden mb-4">
          <img
            src={imageData}
            alt="Documento capturado"
            className="w-full h-auto"
          />
        </div>

        <p className="text-sm text-muted-foreground text-center mb-4">
          Verifica que el documento se vea claro y legible
        </p>

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={onRetake}
            className="flex-1"
            size="lg"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Repetir captura
          </Button>
          
          <Button
            onClick={onContinue}
            className="flex-1"
            size="lg"
          >
            <Check className="mr-2 h-5 w-5" />
            Continuar
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default DocumentPreview;
