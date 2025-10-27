import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import CameraView from '@/components/scanner/CameraView';
import DocumentCropper from '@/components/scanner/DocumentCropper';
import DocumentPreviewWithValidation from '@/components/scanner/DocumentPreviewWithValidation';

type ScanStep = 'camera' | 'crop' | 'validate';

const Scan = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ScanStep>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate('/auth');
      return;
    }

    setUserId(session.user.id);
  };

  const handleCapture = (imageData: string) => {
    setCapturedImage(imageData);
    setStep('crop');
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setStep('camera');
  };

  const handleCropContinue = (croppedImageData: string) => {
    setCapturedImage(croppedImageData);
    setStep('validate');
  };

  const handleSubmitSuccess = () => {
    toast.success('Documento enviado correctamente');
    setCapturedImage(null);
    setStep('camera');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Escaneo de Documentos</h1>
        <Button variant="ghost" size="icon" onClick={handleLogout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </header>

      <main className="container mx-auto p-4 max-w-4xl">
        {step === 'camera' && <CameraView onCapture={handleCapture} />}
        
        {step === 'crop' && capturedImage && (
          <DocumentCropper
            imageData={capturedImage}
            onContinue={handleCropContinue}
            onCancel={handleRetake}
          />
        )}

        {step === 'validate' && capturedImage && userId && (
          <DocumentPreviewWithValidation
            imageData={capturedImage}
            userId={userId}
            onSuccess={handleSubmitSuccess}
            onRetake={handleRetake}
          />
        )}
      </main>
    </div>
  );
};

export default Scan;
