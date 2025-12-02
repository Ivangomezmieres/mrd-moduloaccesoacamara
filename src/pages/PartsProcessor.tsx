import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Upload, CheckCircle2, XCircle, Clock, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useDocumentProcessor, ProcessingResult } from '@/hooks/useDocumentProcessor';

const PartsProcessor = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [processingQueue, setProcessingQueue] = useState<ProcessingResult[]>([]);
  const [isProcessingActive, setIsProcessingActive] = useState(false);
  const { processFile } = useDocumentProcessor();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
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
        toast.error('No tienes permisos para acceder a esta página');
        navigate('/scan');
        return;
      }

      setUserId(session.user.id);
    } finally {
      setIsAuthChecking(false);
    }
  };

  const handleFiles = useCallback((files: File[]) => {
    if (!userId) {
      toast.error('Error: Usuario no autenticado');
      return;
    }

    const newItems: ProcessingResult[] = files.map(file => ({
      fileName: file.name,
      status: 'pending',
    }));

    setProcessingQueue(prev => [...prev, ...newItems]);
    
    // Iniciar procesamiento si no está activo
    if (!isProcessingActive) {
      processQueue([...processingQueue, ...newItems], files);
    }
  }, [userId, processingQueue, isProcessingActive]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file =>
      file.type === 'image/jpeg' || 
      file.type === 'image/png' || 
      file.type === 'image/webp'
    );

    if (files.length > 0) {
      handleFiles(files);
    } else {
      toast.error('Por favor, sube solo archivos JPG, PNG o WEBP');
    }
  }, [handleFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(file =>
      file.type === 'image/jpeg' || 
      file.type === 'image/png' || 
      file.type === 'image/webp'
    );

    if (files.length > 0) {
      handleFiles(files);
    }
    
    // Reset input
    e.target.value = '';
  }, [handleFiles]);

  const processQueue = async (queue: ProcessingResult[], files: File[]) => {
    if (!userId) return;
    
    setIsProcessingActive(true);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      // Actualizar estado a "procesando"
      setProcessingQueue(prev =>
        prev.map(item =>
          item.fileName === file.name && item.status === 'pending'
            ? { ...item, status: 'processing' }
            : item
        )
      );

      // Procesar archivo
      const result = await processFile(file, userId);

      // Actualizar resultado
      setProcessingQueue(prev =>
        prev.map(item =>
          item.fileName === file.name && item.status === 'processing'
            ? result
            : item
        )
      );
    }

    setIsProcessingActive(false);
    toast.success(`${files.length} parte${files.length > 1 ? 's' : ''} procesado${files.length > 1 ? 's' : ''} correctamente`);
  };

  const getStatusIcon = (status: ProcessingResult['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-muted-foreground" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-primary animate-spin" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-600" />;
    }
  };

  const getStatusText = (item: ProcessingResult) => {
    switch (item.status) {
      case 'pending':
        return 'En espera';
      case 'processing':
        return 'Procesando...';
      case 'success':
        return `Procesado · Legibilidad ${item.legibilityScore}%`;
      case 'error':
        return `Error: ${item.error}`;
    }
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Verificando autenticación...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate('/admin/dashboard')}
            >
              <ArrowLeft className="h-5 w-5 mr-2" />
              Volver a Panel de Control
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Procesador de Partes</h1>
              <p className="text-sm text-muted-foreground">
                Sube partes de trabajo y obtén los datos extraídos automáticamente
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {/* Dropzone */}
        <Card
          className={`mb-6 border-2 border-dashed transition-colors cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-border hover:border-primary/50 hover:bg-muted/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <div className="p-12 text-center">
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">
              Arrastra partes aquí
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              o haz clic para seleccionar archivos
            </p>
            <p className="text-xs text-muted-foreground mt-4">
              Formatos: JPG, PNG, WEBP · Múltiples archivos
            </p>
            <input
              id="file-input"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </Card>

        {/* Cola de procesamiento */}
        {processingQueue.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold mb-4">
              Cola de procesamiento ({processingQueue.length})
            </h2>
            <Card className="divide-y">
              {processingQueue.map((item, index) => (
                <div key={`${item.fileName}-${index}`} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getStatusIcon(item.status)}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.fileName}</p>
                        <p className="text-sm text-muted-foreground">
                          {getStatusText(item)}
                        </p>
                      </div>
                    </div>
                    {item.status === 'success' && item.documentId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/admin/document/${item.documentId}`)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Ver
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Estado vacío */}
        {processingQueue.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <p>No hay partes en la cola de procesamiento</p>
            <p className="text-sm mt-2">Arrastra archivos para comenzar</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default PartsProcessor;
