import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { toast } from 'sonner';
import CameraView from '@/components/scanner/CameraView';
import DocumentPreviewWithValidation from '@/components/scanner/DocumentPreviewWithValidation';

type ScanStep = 'camera' | 'validate';

const Scan = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<ScanStep>('camera');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate('/auth');
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);

    const isSuperAdmin = roles?.some(r => r.role === 'superadmin') ?? false;
    setIsSuperAdmin(isSuperAdmin);
    setUserId(session.user.id);
  };

  const handleCapture = (imageData: string) => {
    setCapturedImage(imageData);
    setStep('validate');
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setStep('camera');
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
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <Button variant="outline" onClick={() => navigate('/admin/dashboard')}>
              Ir al Dashboard
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-4xl">
        {step === 'camera' && <CameraView onCapture={handleCapture} />}

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
