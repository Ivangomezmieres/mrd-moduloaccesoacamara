import { useState } from 'react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { CheckCircle, XCircle, Eye, Calendar, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Document {
  id: string;
  storage_path: string;
  meta: any;
  created_at: string;
  uploader: string;
  status: string;
}

interface DocumentCardProps {
  document: Document;
  onApprove: (documentId: string) => void;
  onReject: (documentId: string, notes: string) => void;
}

const DocumentCard = ({ document, onApprove, onReject }: DocumentCardProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const loadImage = async () => {
    try {
      setImageError(null);
      const { data, error } = await supabase.storage
        .from('scans')
        .createSignedUrl(document.storage_path, 3600);

      if (error) throw error;
      
      if (data?.signedUrl) {
        setImageUrl(data.signedUrl);
      } else {
        throw new Error('No se pudo generar URL firmada');
      }
    } catch (error: any) {
      console.error('Error loading image:', error);
      setImageError(error.message || 'Error al cargar la imagen');
      toast.error('No se pudo cargar la imagen del documento');
    }
  };

  const handleApprove = () => {
    onApprove(document.id);
  };

  const handleReject = () => {
    if (!rejectNotes.trim()) {
      return;
    }
    onReject(document.id, rejectNotes);
    setShowRejectDialog(false);
    setRejectNotes('');
  };

  const handleViewImage = async () => {
    if (!imageUrl) {
      setIsLoadingImage(true);
      await loadImage();
      setIsLoadingImage(false);
    }
    setShowImageDialog(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Parte #{document.meta?.parteNumero || 'Sin número'}</span>
          <div className="flex items-center text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 mr-1" />
            {format(new Date(document.created_at), 'dd MMM', { locale: es })}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2 text-sm">
        <div>
          <span className="font-semibold">Cliente:</span> {document.meta?.cliente || 'N/A'}
        </div>
        <div>
          <span className="font-semibold">Obra:</span> {document.meta?.obra || 'N/A'}
        </div>
        <div>
          <span className="font-semibold">Montador:</span> {document.meta?.montadorNombre || 'N/A'}
        </div>
        <div>
          <span className="font-semibold">Total horas:</span> {document.meta?.totalHoras?.toFixed(1) || '0'} h
        </div>
      </CardContent>

      <CardFooter className="flex gap-2">
        <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1" 
              onClick={handleViewImage}
              disabled={isLoadingImage}
            >
              {isLoadingImage ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1" />
                  Ver
                </>
              )}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Documento escaneado</DialogTitle>
            </DialogHeader>
            {imageError ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <XCircle className="h-12 w-12 text-destructive" />
                <p className="text-destructive font-medium">{imageError}</p>
                <Button variant="outline" onClick={loadImage}>
                  Reintentar
                </Button>
              </div>
            ) : imageUrl ? (
              <img src={imageUrl} alt="Documento" className="w-full h-auto" />
            ) : (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-muted-foreground ml-2">Cargando imagen...</p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Button
          size="sm"
          variant="default"
          className="flex-1"
          onClick={handleApprove}
        >
          <CheckCircle className="h-4 w-4 mr-1" />
          Aprobar
        </Button>

        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogTrigger asChild>
            <Button size="sm" variant="destructive" className="flex-1">
              <XCircle className="h-4 w-4 mr-1" />
              Rechazar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rechazar documento</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="Motivo del rechazo..."
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowRejectDialog(false)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={!rejectNotes.trim()}
                  className="flex-1"
                >
                  Confirmar rechazo
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </CardFooter>
    </Card>
  );
};

export default DocumentCard;
