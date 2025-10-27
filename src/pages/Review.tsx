import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { LogOut, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import DocumentCard from '@/components/reviewer/DocumentCard';

interface Document {
  id: string;
  storage_path: string;
  meta: any;
  created_at: string;
  uploader: string;
  status: string;
}

const Review = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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

    // Check if user has revisor role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);

    const isSuperAdmin = roles?.some(r => r.role === 'superadmin') ?? false;
    const hasReviewerPermission = roles?.some(r => ['revisor', 'admin', 'superadmin'].includes(r.role)) ?? false;
    
    if (!hasReviewerPermission) {
      toast.error('No tienes permisos para acceder a esta página');
      navigate('/scan');
      return;
    }

    setIsSuperAdmin(isSuperAdmin);
    setUserId(session.user.id);
    loadDocuments();
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading documents:', error);
      toast.error('Error al cargar documentos');
    } else {
      setDocuments(data || []);
    }

    setIsLoading(false);
  };

  const handleApprove = async (documentId: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from('documents')
      .update({
        status: 'approved',
        reviewed_by: userId,
        validated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (error) {
      console.error('Error approving document:', error);
      toast.error('Error al aprobar documento');
    } else {
      toast.success('Documento aprobado');
      loadDocuments();
    }
  };

  const handleReject = async (documentId: string, notes: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from('documents')
      .update({
        status: 'rejected',
        reviewed_by: userId,
        review_notes: notes,
        validated_at: new Date().toISOString()
      })
      .eq('id', documentId);

    if (error) {
      console.error('Error rejecting document:', error);
      toast.error('Error al rechazar documento');
    } else {
      toast.success('Documento rechazado');
      loadDocuments();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold">Revisión de Documentos</h1>
        <div className="flex gap-2">
          {isSuperAdmin && (
            <Button variant="outline" onClick={() => navigate('/admin/dashboard')}>
              Volver al Dashboard
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={loadDocuments}>
            <RefreshCw className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container mx-auto p-4 max-w-6xl">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Cargando documentos...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No hay documentos pendientes de revisión</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Review;
