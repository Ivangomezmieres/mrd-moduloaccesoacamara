import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);
    const hasSuperAdmin = roles?.some(r => r.role === 'superadmin');
    if (!hasSuperAdmin) {
      toast.error('No tienes permisos');
      navigate('/scan');
      return;
    }
    setIsLoading(false);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <h1 className="text-2xl font-bold">Panel de Control</h1>
      <p>El dashboard esta cargando correctamente.</p>
    </div>
  );
}
