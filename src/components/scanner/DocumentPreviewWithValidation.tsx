import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RotateCcw, Loader2, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  const [isValidating, setIsValidating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);

  useEffect(() => {
    validateAndSave();
  }, []);

  const validateAndSave = async () => {
    try {
      setIsValidating(true);
      
      // Call edge function for AI legibility validation
      const { data: validation, error: validationError } = await supabase.functions.invoke(
        'validate-document',
        {
          body: { imageData }
        }
      );

      if (validationError) throw validationError;

      setValidationResult(validation);
      
      // Check if document is legible (>= 80%)
      if (!validation.legible || validation.legibilityPercentage < 80) {
        setIsValidating(false);
        toast.error(
          `La foto no es legible (${validation.legibilityPercentage}% legible). Por favor, repite la foto.`,
          { duration: 5000 }
        );
        return;
      }

      // Document is legible, proceed to save
      setIsValidating(false);
      setIsSaving(true);

      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      // Upload image to storage
      const fileName = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Save document metadata
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          storage_path: fileName,
          uploader: userId,
          status: 'pending',
          meta: {
            validationResult: validation,
            uploadedAt: new Date().toISOString()
          }
        });

      if (dbError) throw dbError;

      setIsSaving(false);
      toast.success('Documento guardado correctamente');
      onSuccess();
    } catch (error: any) {
      console.error('Error processing document:', error);
      toast.error(error.message || 'Error al procesar el documento');
      setIsValidating(false);
      setIsSaving(false);
    }
  };

  const showRetakeButton = !isValidating && !isSaving && validationResult && !validationResult.legible;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-4">Procesando documento</h2>
        
        <div className="relative bg-muted rounded-lg overflow-hidden mb-4">
          <img
            src={imageData}
            alt="Documento capturado"
            className="w-full h-auto"
          />
        </div>

        {isValidating && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Validando legibilidad del documento...</p>
          </div>
        )}

        {isSaving && (
          <div className="flex items-center justify-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-sm font-medium">Guardando documento...</p>
          </div>
        )}

        {validationResult && validationResult.legible && !isSaving && (
          <div className="flex items-center justify-center gap-3 py-4 text-green-600">
            <CheckCircle2 className="h-6 w-6" />
            <p className="text-sm font-medium">
              Documento legible ({validationResult.legibilityPercentage}%)
            </p>
          </div>
        )}

        {validationResult && !validationResult.legible && (
          <div className="space-y-3">
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm font-medium text-destructive">
                La foto no es lo suficientemente legible
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Legibilidad: {validationResult.legibilityPercentage}% (mínimo: 80%)
              </p>
              {validationResult.illegibleFields?.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Campos ilegibles: {validationResult.illegibleFields.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {showRetakeButton && (
          <Button
            variant="outline"
            onClick={onRetake}
            className="w-full"
            size="lg"
          >
            <RotateCcw className="mr-2 h-5 w-5" />
            Repetir foto
          </Button>
        )}
      </Card>
    </div>
  );
};

export default DocumentPreviewWithValidation;
