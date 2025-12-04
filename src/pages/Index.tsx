import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScanLine, Download } from 'lucide-react';

const Index = () => {
  console.log('Index component mounted');
  const navigate = useNavigate();

  useEffect(() => {
    console.log('Index useEffect running');
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (session) {
      // Check user role and redirect
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id);

      if (roles && roles.length > 0) {
        // Roles en orden de prioridad (de mayor a menor)
        const hasSuperAdmin = roles.some(r => r.role === 'superadmin');
        const hasAdmin = roles.some(r => r.role === 'admin');
        const hasRevisor = roles.some(r => r.role === 'revisor');
        
        // Redirigir según el rol de mayor nivel
        if (hasSuperAdmin) {
          navigate('/admin/dashboard');
        } else if (hasAdmin) {
          navigate('/admin/users');
        } else if (hasRevisor) {
          navigate('/admin/dashboard');
        } else {
          navigate('/scan');
        }
      } else {
        navigate('/scan');
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center space-y-8 max-w-md">
        <div className="flex justify-center">
          <div className="p-6 rounded-full bg-primary/10">
            <ScanLine className="w-16 h-16 text-primary" />
          </div>
        </div>

        <div className="space-y-4">
          <h1 className="text-4xl font-bold">MRD Scanner</h1>
          <p className="text-xl text-muted-foreground">
            Escanea y envía documentos de forma profesional
          </p>
        </div>

        <div className="space-y-3">
          <Button 
            size="lg" 
            className="w-full"
            onClick={() => navigate('/auth')}
          >
            Iniciar sesión
          </Button>

          <Button 
            size="lg" 
            variant="outline" 
            className="w-full"
            onClick={() => navigate('/install')}
          >
            <Download className="mr-2 h-5 w-5" />
            Instalar aplicación
          </Button>
        </div>

        <div className="pt-8 space-y-2 text-sm text-muted-foreground">
          <p>✓ Detección automática de bordes</p>
          <p>✓ Corrección de perspectiva</p>
          <p>✓ Escaneos profesionales</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
