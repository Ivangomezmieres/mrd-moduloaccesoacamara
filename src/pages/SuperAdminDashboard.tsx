import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Download, Filter, Search, Eye, BarChart3, FileText, Users, Clock, CheckCircle, AlertCircle, User, Building, Briefcase, Calendar, PenTool, ZoomIn, Trash2, XCircle, Loader2, Pencil, Save, Plus } from 'lucide-react';
import { toast } from 'sonner';
interface ExtractedData {
  parteNumero: string | null;
  cliente: string | null;
  emplazamiento: string | null;
  obra: string | null;
  trabajoRealizado: string | null;
  // Estructura antigua (compatibilidad)
  montador?: {
    nombre: string | null;
    apellidos: string | null;
  };
  horas?: {
    ordinarias: number;
    extras: number;
    festivas: number;
  };
  // Nueva estructura
  montadores?: Array<{
    nombreCompleto: string;
    horas: number;
  }>;
  horasTotales?: {
    ordinarias: number;
    extras: number;
    festivas: number;
  };
  fecha: string | null;
  firmas: {
    montador: boolean;
    cliente: boolean;
  };
}
interface Document {
  id: string;
  storage_path: string;
  uploader: string;
  status: string;
  created_at: string;
  validated_at: string | null;
  reviewed_by: string | null;
  review_notes: string | null;
  meta: {
    validationResult: any;
    extractedData?: ExtractedData;
    legibilityScore: number;
    hadAutoCrop: boolean;
  };
  profiles?: {
    full_name: string;
  };
}
const SuperAdminDashboard = () => {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [filteredDocuments, setFilteredDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNotes, setRejectNotes] = useState('');
  const [isUpdatingDocument, setIsUpdatingDocument] = useState(false);
  
  // Estados para edición de datos extraídos
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData | null>(null);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  useEffect(() => {
    checkAuth();
    loadDocuments();
  }, []);
  useEffect(() => {
    filterDocuments();
  }, [filterStatus, searchTerm, documents]);
  const checkAuth = async () => {
    const {
      data: {
        session
      }
    } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }
    
    setUserId(session.user.id);
    
    const {
      data: roles
    } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id);
    const hasSuperAdmin = roles?.some(r => r.role === 'superadmin');
    if (!hasSuperAdmin) {
      toast.error('No tienes permisos para acceder a esta página');
      navigate('/scan');
    }
  };
  const loadDocuments = async () => {
    setIsLoading(true);
    const {
      data,
      error
    } = await supabase.from('documents').select(`
        *,
        profiles:uploader (
          full_name
        )
      `).order('created_at', {
      ascending: false
    });
    if (error) {
      console.error('Error loading documents:', error);
      toast.error('Error al cargar documentos');
    } else {
      setDocuments((data || []) as any);
    }
    setIsLoading(false);
  };
  const filterDocuments = () => {
    let filtered = documents;
    if (filterStatus !== 'all') {
      filtered = filtered.filter(doc => doc.status === filterStatus);
    }
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(doc => {
        const extractedData = doc.meta?.extractedData;
        if (!extractedData) return false;
        return extractedData.parteNumero?.toLowerCase().includes(term) || extractedData.cliente?.toLowerCase().includes(term) || extractedData.emplazamiento?.toLowerCase().includes(term) || extractedData.obra?.toLowerCase().includes(term) || extractedData.montador?.nombre?.toLowerCase().includes(term) || extractedData.montador?.apellidos?.toLowerCase().includes(term) || doc.profiles?.full_name?.toLowerCase().includes(term);
      });
    }
    setFilteredDocuments(filtered);
  };
  const handleViewDetails = async (doc: Document) => {
    setSelectedDoc(doc);
    
    // Inicializar datos editables con copia profunda
    const existingData = doc.meta?.extractedData;
    
    // Compatibilidad: convertir estructura antigua a nueva
    let initialData;
    if (existingData) {
      initialData = JSON.parse(JSON.stringify(existingData));
      
      // Si tiene estructura antigua (montador singular), convertir a nueva
      if (existingData.montador && !existingData.montadores) {
        initialData.montadores = [
          {
            nombreCompleto: `${existingData.montador.nombre || ''} ${existingData.montador.apellidos || ''}`.trim(),
            horas: existingData.horas?.ordinarias || 0
          }
        ];
        
        // Mantener horasTotales si existe, sino crear
        if (!initialData.horasTotales) {
          initialData.horasTotales = existingData.horas || { ordinarias: 0, extras: 0, festivas: 0 };
        }
      }
    } else {
      // Datos por defecto para documentos sin datos extraídos
      initialData = {
        parteNumero: '',
        fecha: '',
        cliente: '',
        emplazamiento: '',
        obra: '',
        montadores: [],
        horasTotales: { ordinarias: 0, extras: 0, festivas: 0 },
        trabajoRealizado: '',
        firmas: { montador: false, cliente: false }
      };
    }
    
    setEditedData(initialData);
    setIsEditMode(false); // Siempre empieza en modo lectura
    const {
      data
    } = await supabase.storage.from('scans').createSignedUrl(doc.storage_path, 3600);
    if (data?.signedUrl) {
      setImageUrl(data.signedUrl);
      
      // Si solo hay 0 o 1 montador, intentar reextraer automáticamente
      if (!initialData.montadores || initialData.montadores.length <= 1) {
        await reExtractMontadores(data.signedUrl);
      }
    }
  };

  const reExtractMontadores = async (imgUrl?: string) => {
    const urlToUse = imgUrl || imageUrl;
    if (!urlToUse) {
      toast.error('No se pudo obtener la URL de la imagen');
      return;
    }

    setIsReextracting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-document', {
        body: { imageData: urlToUse }
      });

      if (error) {
        console.error('Error reextrayendo montadores:', error);
        toast.error('Error al reextraer montadores desde la imagen');
        return;
      }

      const extractedData = data?.extractedData;
      
      if (extractedData?.montadores && extractedData.montadores.length > 1) {
        // Calcular horasTotales desde montadores si no existe
        const calculatedHorasTotales = extractedData.horasTotales || {
          ordinarias: extractedData.montadores.reduce((sum: number, m: any) => sum + (m.horas || 0), 0),
          extras: 0,
          festivas: 0
        };

        setEditedData(prev => ({
          ...prev!,
          montadores: extractedData.montadores,
          horasTotales: calculatedHorasTotales
        }));
        
        toast.success(`✅ ${extractedData.montadores.length} montadores extraídos desde la imagen`);
      } else {
        toast.info('ℹ️ No se encontraron múltiples montadores en la imagen');
      }
    } catch (error) {
      console.error('Error inesperado reextrayendo:', error);
      toast.error('Error inesperado al reextraer datos');
    } finally {
      setIsReextracting(false);
    }
  };
  const handleDeleteDocument = async (docId: string, storagePath: string) => {
    const confirmed = window.confirm('¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer.');
    if (!confirmed) return;
    try {
      // 1. Eliminar archivo del storage
      const {
        error: storageError
      } = await supabase.storage.from('scans').remove([storagePath]);
      if (storageError) {
        console.error('Error deleting file from storage:', storageError);
        toast.error('Error al eliminar archivo del storage');
        return;
      }

      // 2. Eliminar registro de la base de datos
      const {
        error: dbError
      } = await supabase.from('documents').delete().eq('id', docId);
      if (dbError) {
        console.error('Error deleting document from database:', dbError);
        toast.error('Error al eliminar documento de la base de datos');
        return;
      }

      // 3. Actualizar lista local
      setDocuments(prev => prev.filter(doc => doc.id !== docId));
      toast.success('Documento eliminado correctamente');
    } catch (error) {
      console.error('Unexpected error deleting document:', error);
      toast.error('Error inesperado al eliminar documento');
    }
  };

  const handleApproveDocument = async (documentId: string) => {
    if (!userId) {
      toast.error('No se pudo identificar el usuario');
      return;
    }

    const confirmed = window.confirm(
      '¿Estás seguro de que deseas aprobar este documento?'
    );
    
    if (!confirmed) return;

    setIsUpdatingDocument(true);

    try {
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
        return;
      }

      // Actualizar lista local
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === documentId 
            ? { 
                ...doc, 
                status: 'approved', 
                reviewed_by: userId,
                validated_at: new Date().toISOString() 
              }
            : doc
        )
      );

      // Actualizar selectedDoc si está abierto
      if (selectedDoc && selectedDoc.id === documentId) {
        setSelectedDoc({
          ...selectedDoc,
          status: 'approved',
          reviewed_by: userId,
          validated_at: new Date().toISOString()
        });
      }

      toast.success('Documento aprobado correctamente');
    } catch (error) {
      console.error('Unexpected error approving document:', error);
      toast.error('Error inesperado al aprobar documento');
    } finally {
      setIsUpdatingDocument(false);
    }
  };

  // Función para cambiar estado del documento (pendiente o aprobado)
  const handleChangeStatus = async (newStatus: 'pending' | 'approved') => {
    if (!selectedDoc || !userId) {
      toast.error('No se pudo identificar el documento o usuario');
      return;
    }

    const statusText = newStatus === 'approved' ? 'aprobar' : 'marcar como pendiente';
    const confirmed = window.confirm(
      `¿Estás seguro de que deseas ${statusText} este documento?`
    );
    
    if (!confirmed) return;

    setIsUpdatingDocument(true);

    try {
      const updateData: any = {
        status: newStatus,
        reviewed_by: userId,
        validated_at: new Date().toISOString()
      };

      // Si se marca como pendiente, limpiar las notas de rechazo
      if (newStatus === 'pending') {
        updateData.review_notes = null;
      }

      const { error } = await supabase
        .from('documents')
        .update(updateData)
        .eq('id', selectedDoc.id);

      if (error) {
        console.error('Error updating document status:', error);
        toast.error('Error al actualizar el estado del documento');
        return;
      }

      // Actualizar lista local
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === selectedDoc.id 
            ? { ...doc, ...updateData }
            : doc
        )
      );

      // Actualizar selectedDoc
      setSelectedDoc({
        ...selectedDoc,
        ...updateData
      });

      const successMsg = newStatus === 'approved' 
        ? 'Documento aprobado correctamente'
        : 'Documento marcado como pendiente';
      
      toast.success(successMsg);
    } catch (error) {
      console.error('Unexpected error updating document status:', error);
      toast.error('Error inesperado al actualizar el estado');
    } finally {
      setIsUpdatingDocument(false);
    }
  };

  const handleRejectDocumentWithNotes = async () => {
    if (!selectedDoc || !userId) {
      toast.error('No se pudo identificar el documento o usuario');
      return;
    }

    if (!rejectNotes.trim()) {
      toast.error('Debes proporcionar una razón para el rechazo');
      return;
    }

    setIsUpdatingDocument(true);

    try {
      const { error } = await supabase
        .from('documents')
        .update({
          status: 'rejected',
          reviewed_by: userId,
          review_notes: rejectNotes.trim(),
          validated_at: new Date().toISOString()
        })
        .eq('id', selectedDoc.id);

      if (error) {
        console.error('Error rejecting document:', error);
        toast.error('Error al rechazar documento');
        return;
      }

      // Actualizar lista local
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === selectedDoc.id 
            ? { 
                ...doc, 
                status: 'rejected', 
                reviewed_by: userId,
                review_notes: rejectNotes.trim(),
                validated_at: new Date().toISOString() 
              }
            : doc
        )
      );

      // Actualizar selectedDoc
      setSelectedDoc({
        ...selectedDoc,
        status: 'rejected',
        reviewed_by: userId,
        review_notes: rejectNotes.trim(),
        validated_at: new Date().toISOString()
      });

      toast.success('Documento rechazado correctamente');
      
      // Cerrar dialog y limpiar notas
      setShowRejectDialog(false);
      setRejectNotes('');
    } catch (error) {
      console.error('Unexpected error rejecting document:', error);
      toast.error('Error inesperado al rechazar documento');
    } finally {
      setIsUpdatingDocument(false);
    }
  };

  const handleSaveEditedData = async () => {
    if (!selectedDoc || !editedData) {
      toast.error('No hay datos para guardar');
      return;
    }

    setIsSavingChanges(true);

    try {
      // Actualizar el meta.extractedData en la base de datos
      const { error } = await supabase
        .from('documents')
        .update({
          meta: {
            ...selectedDoc.meta,
            extractedData: editedData
          } as any
        })
        .eq('id', selectedDoc.id);

      if (error) {
        console.error('Error saving edited data:', error);
        toast.error('Error al guardar los cambios');
        return;
      }

      // Actualizar lista local
      setDocuments(prev => 
        prev.map(doc => 
          doc.id === selectedDoc.id 
            ? { 
                ...doc, 
                meta: {
                  ...doc.meta,
                  extractedData: editedData
                }
              }
            : doc
        )
      );

      // Actualizar selectedDoc
      setSelectedDoc({
        ...selectedDoc,
        meta: {
          ...selectedDoc.meta,
          extractedData: editedData
        }
      });

      toast.success('Cambios guardados correctamente');
      setIsEditMode(false); // Volver a modo lectura
    } catch (error) {
      console.error('Unexpected error saving data:', error);
      toast.error('Error inesperado al guardar');
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleCancelEdit = () => {
    // Restaurar datos originales
    setEditedData(selectedDoc?.meta?.extractedData ? JSON.parse(JSON.stringify(selectedDoc.meta.extractedData)) : null);
    setIsEditMode(false);
    toast.info('Cambios descartados');
  };

  const handleLogout = async () => {
    try {
      const {
        error
      } = await supabase.auth.signOut();
      if (error) {
        console.warn('Logout warning:', error.message);
        if (error.message.includes('session')) {
          toast.info('Sesión cerrada localmente');
        } else {
          toast.error('Error al cerrar sesión: ' + error.message);
        }
      } else {
        toast.success('Sesión cerrada correctamente');
      }
    } catch (err) {
      console.error('Logout exception:', err);
      toast.error('Error inesperado al cerrar sesión');
    } finally {
      localStorage.removeItem('supabase.auth.token');
      navigate('/auth');
    }
  };
  const exportToCSV = () => {
    const csvData = filteredDocuments.map(doc => {
      const extracted = doc.meta?.extractedData;
      const horasData = extracted?.horasTotales || extracted?.horas;
      const totalHoras = horasData ? horasData.ordinarias + horasData.extras + horasData.festivas : 0;
      return {
        'ID': doc.id,
        'Nº Parte': extracted?.parteNumero || 'N/A',
        'Cliente': extracted?.cliente || 'N/A',
        'Emplazamiento': extracted?.emplazamiento || 'N/A',
        'Obra': extracted?.obra || 'N/A',
        'Trabajo': extracted?.trabajoRealizado || 'N/A',
        'Montador Nombre': extracted?.montador?.nombre || 'N/A',
        'Montador Apellidos': extracted?.montador?.apellidos || 'N/A',
        'Fecha Parte': extracted?.fecha || 'N/A',
        'Horas Ordinarias': horasData?.ordinarias || 0,
        'Horas Extras': horasData?.extras || 0,
        'Horas Festivas': horasData?.festivas || 0,
        'Total Horas': totalHoras,
        'Firma Montador': extracted?.firmas?.montador ? 'Sí' : 'No',
        'Firma Cliente': extracted?.firmas?.cliente ? 'Sí' : 'No',
        'Estado': doc.status,
        'Legibilidad %': doc.meta?.legibilityScore || 0,
        'Auto-recortado': doc.meta?.hadAutoCrop ? 'Sí' : 'No',
        'Subido por': doc.profiles?.full_name || 'N/A',
        'Fecha Subida': new Date(doc.created_at).toLocaleString('es-ES'),
        'Validado': doc.validated_at ? new Date(doc.validated_at).toLocaleString('es-ES') : 'No'
      };
    });
    if (csvData.length === 0) {
      toast.error('No hay documentos para exportar');
      return;
    }
    const headers = Object.keys(csvData[0]).join(',');
    const rows = csvData.map(row => Object.values(row).map(val => typeof val === 'string' && val.includes(',') ? `"${val}"` : val).join(',')).join('\n');
    const csvContent = `${headers}\n${rows}`;
    const blob = new Blob(['\ufeff' + csvContent], {
      type: 'text/csv;charset=utf-8;'
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `documentos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Archivo CSV descargado correctamente');
  };
  const stats = {
    total: documents.length,
    pending: documents.filter(d => d.status === 'pending').length,
    approved: documents.filter(d => d.status === 'approved').length,
    rejected: documents.filter(d => d.status === 'rejected').length,
    avgLegibility: documents.length > 0 ? Math.round(documents.reduce((acc, d) => acc + (d.meta?.legibilityScore || 0), 0) / documents.length) : 0,
    totalHours: documents.reduce((acc, d) => {
      const extracted = d.meta?.extractedData;
      const horasData = extracted?.horasTotales || extracted?.horas;
      if (!horasData) return acc;
      return acc + horasData.ordinarias + horasData.extras + horasData.festivas;
    }, 0),
    uniqueClients: new Set(documents.map(d => d.meta?.extractedData?.cliente).filter(Boolean)).size,
    uniqueMontadores: new Set(documents.map(d => {
      const m = d.meta?.extractedData?.montador;
      return m ? `${m.nombre} ${m.apellidos}` : null;
    }).filter(Boolean)).size
  };
  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Panel Superadministrador</h1>
              <p className="text-sm text-muted-foreground">
                Vista completa de documentos y datos extraídos
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/users')}>
                <Users className="mr-2 h-4 w-4" />
                Usuarios
              </Button>
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="mr-2 h-4 w-4" />
                Exportar CSV
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Documentos</p>
                <p className="text-3xl font-bold">{stats.total}</p>
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Pendientes</p>
                <p className="text-3xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </Card>

          

          
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Aprobados</p>
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
          </Card>
          
          
        </div>

        <Card className="p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por cliente, montador, nº parte..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10" />
              </div>
            </div>
            
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Filtrar por estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los estados</SelectItem>
                <SelectItem value="pending">Pendientes</SelectItem>
                <SelectItem value="approved">Aprobados</SelectItem>
                <SelectItem value="rejected">Rechazados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          
        </Card>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Parte</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Montador</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                  
                  <TableHead>Firmas</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length === 0 ? <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No se encontraron documentos
                    </TableCell>
                  </TableRow> : filteredDocuments.map(doc => {
                const extracted = doc.meta?.extractedData;
                const horasData = extracted?.horasTotales || extracted?.horas;
                const totalHoras = horasData ? horasData.ordinarias + horasData.extras + horasData.festivas : 0;
                return <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {extracted?.parteNumero || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.cliente || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.montador ? `${extracted.montador.nombre || ''} ${extracted.montador.apellidos || ''}`.trim() : <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.fecha ? new Date(extracted.fecha).toLocaleDateString('es-ES') : <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {totalHoras > 0 ? <div className="text-sm">
                              <div className="font-medium">{totalHoras}h</div>
                              <div className="text-xs text-muted-foreground">
                                {horasData?.ordinarias}+{horasData?.extras}+{horasData?.festivas}
                              </div>
                            </div> : <span className="text-muted-foreground">0h</span>}
                        </TableCell>
                        <TableCell>
                          <Badge variant={doc.status === 'approved' ? 'default' : doc.status === 'pending' ? 'secondary' : 'destructive'}>
                            {doc.status === 'approved' ? 'Aprobado' : doc.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                          </Badge>
                        </TableCell>
                        
                        <TableCell>
                          <div className="flex gap-1">
                            {extracted?.firmas?.montador && <Badge variant="outline" className="text-xs">M</Badge>}
                            {extracted?.firmas?.cliente && <Badge variant="outline" className="text-xs">C</Badge>}
                            {!extracted?.firmas?.montador && !extracted?.firmas?.cliente && <span className="text-muted-foreground text-xs">Sin firmas</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(doc)}>
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteDocument(doc.id, doc.storage_path)} className="text-slate-950 rounded-md font-medium bg-neutral-50">
                              <Trash2 className="h-4 w-4 mr-1" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>;
              })}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Datos extraídos del parte
              </DialogTitle>
              <div className="flex gap-2">
                {!isEditMode ? (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsEditMode(true)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Editar
                  </Button>
                ) : (
                  <>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isSavingChanges}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Cancelar
                    </Button>
                    <Button 
                      size="sm" 
                      variant="default"
                      onClick={handleSaveEditedData}
                      disabled={isSavingChanges}
                    >
                      {isSavingChanges ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Guardar
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </DialogHeader>
          
          {selectedDoc && <div className="grid grid-cols-5 gap-6 mt-4">
              {/* Columna izquierda: Imagen del documento (2/5) */}
              <div className="col-span-2 space-y-4">
                {imageUrl && <div className="relative border rounded-lg overflow-hidden bg-muted/20">
                    <img src={imageUrl} alt="Documento escaneado" className="w-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(imageUrl, '_blank')} title="Click para ampliar" />
                    <div className="absolute top-2 right-2 bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-full border shadow-sm">
                      <div className="flex items-center gap-2">
                        <Eye className="h-3.5 w-3.5" />
                        <span className="text-xs font-medium">
                          {selectedDoc.meta?.legibilityScore}%
                        </span>
                      </div>
                    </div>
                  </div>}
                
                <div className="space-y-2">
                  <Button variant="outline" className="w-full" onClick={() => window.open(imageUrl, '_blank')}>
                    <ZoomIn className="mr-2 h-4 w-4" />
                    Ver en tamaño completo
                  </Button>
                  <Button variant="outline" className="w-full" onClick={() => {
                const link = document.createElement('a');
                link.href = imageUrl;
                link.download = `documento_${selectedDoc.meta?.extractedData?.parteNumero || 'sin-numero'}.jpg`;
                link.click();
                toast.success('Descargando imagen...');
              }}>
                    <Download className="mr-2 h-4 w-4" />
                    Descargar imagen
                  </Button>
                </div>

                <Card className="p-4">
                  <h3 className="font-semibold mb-3 text-sm">Calidad del documento</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-muted-foreground">Legibilidad</span>
                        <span className="font-medium">{selectedDoc.meta?.legibilityScore || 0}%</span>
                      </div>
                      <Progress value={selectedDoc.meta?.legibilityScore || 0} className="h-2" />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Auto-recortado:</span>
                      <Badge variant={selectedDoc.meta?.hadAutoCrop ? "default" : "secondary"} className="text-xs">
                        {selectedDoc.meta?.hadAutoCrop ? 'Sí' : 'No'}
                      </Badge>
                    </div>
                  </div>
                </Card>
              </div>
              
              {/* Columna derecha: Datos extraídos en Tabs (3/5) */}
              <div className="col-span-3">
                <Tabs defaultValue="parte" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="parte">
                      <FileText className="h-4 w-4 mr-1" />
                      Parte
                    </TabsTrigger>
                    <TabsTrigger value="montador">
                      <User className="h-4 w-4 mr-1" />
                      Montador
                    </TabsTrigger>
                    <TabsTrigger value="trabajo">
                      <Briefcase className="h-4 w-4 mr-1" />
                      Trabajo
                    </TabsTrigger>
                    <TabsTrigger value="validacion">
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Validación
                    </TabsTrigger>
                  </TabsList>
                  
                  {/* Tab: Datos del Parte */}
                  <TabsContent value="parte" className="space-y-4 mt-4">
                    <Card className="p-4">
                      <dl className="space-y-3">
                        {/* Nº de Parte */}
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Nº de Parte</dt>
                            {isEditMode ? (
                              <Input
                                type="text"
                                value={editedData?.parteNumero || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData!,
                                  parteNumero: e.target.value
                                })}
                                className="font-semibold"
                                placeholder="Ingrese número de parte"
                              />
                            ) : (
                              <dd className="font-semibold text-lg">
                                {selectedDoc.meta?.extractedData?.parteNumero || 
                                  <span className="text-muted-foreground text-base">N/A</span>}
                              </dd>
                            )}
                          </div>
                        </div>

                        {/* Fecha del Parte */}
                        <div className="flex items-start gap-3">
                          <Calendar className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Fecha del Parte</dt>
                            {isEditMode ? (
                              <Input
                                type="date"
                                value={editedData?.fecha ? new Date(editedData.fecha).toISOString().split('T')[0] : ''}
                                onChange={(e) => setEditedData({
                                  ...editedData!,
                                  fecha: e.target.value
                                })}
                                className="font-medium"
                              />
                            ) : (
                              <dd className="font-medium">
                                {selectedDoc.meta?.extractedData?.fecha ? 
                                  new Date(selectedDoc.meta.extractedData.fecha).toLocaleDateString('es-ES', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  }) : 'N/A'}
                              </dd>
                            )}
                          </div>
                        </div>

                        {/* Cliente */}
                        <div className="flex items-start gap-3">
                          <Building className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Cliente</dt>
                            {isEditMode ? (
                              <Input
                                type="text"
                                value={editedData?.cliente || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData!,
                                  cliente: e.target.value
                                })}
                                className="font-medium text-blue-600"
                                placeholder="Ingrese nombre del cliente"
                              />
                            ) : (
                              <dd className="font-medium text-blue-600">
                                {selectedDoc.meta?.extractedData?.cliente || 'N/A'}
                              </dd>
                            )}
                          </div>
                        </div>

                        {/* Emplazamiento */}
                        <div className="flex items-start gap-3">
                          <Building className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Emplazamiento</dt>
                            {isEditMode ? (
                              <Input
                                type="text"
                                value={editedData?.emplazamiento || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData!,
                                  emplazamiento: e.target.value
                                })}
                                className="font-medium"
                                placeholder="Ingrese emplazamiento"
                              />
                            ) : (
                              <dd className="font-medium">
                                {selectedDoc.meta?.extractedData?.emplazamiento || 'N/A'}
                              </dd>
                            )}
                          </div>
                        </div>

                        {/* Obra */}
                        <div className="flex items-start gap-3">
                          <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Obra</dt>
                            {isEditMode ? (
                              <Input
                                type="text"
                                value={editedData?.obra || ''}
                                onChange={(e) => setEditedData({
                                  ...editedData!,
                                  obra: e.target.value
                                })}
                                className="font-medium"
                                placeholder="Ingrese nombre de la obra"
                              />
                            ) : (
                              <dd className="font-medium">
                                {selectedDoc.meta?.extractedData?.obra || 'N/A'}
                              </dd>
                            )}
                          </div>
                        </div>
                      </dl>
                    </Card>
                  </TabsContent>
                  
                  {/* Tab: Montador y Horas */}
                  <TabsContent value="montador" className="space-y-4 mt-4">
                    {/* Lista de Montadores */}
                    <Card className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold flex items-center gap-2">
                          <User className="h-4 w-4" />
                          Datos de los Montadores
                        </h3>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => reExtractMontadores()}
                            disabled={isReextracting || !imageUrl}
                          >
                            {isReextracting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Extrayendo...
                              </>
                            ) : (
                              <>
                                <ZoomIn className="mr-2 h-4 w-4" />
                                Completar desde imagen
                              </>
                            )}
                          </Button>
                          {isEditMode && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => {
                                const newMontadores = [...(editedData?.montadores || []), { nombreCompleto: '', horas: 0 }];
                                setEditedData({
                                  ...editedData!,
                                  montadores: newMontadores
                                });
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Añadir Montador
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Mostrar lista de montadores */}
                        {(editedData?.montadores || []).length > 0 ? (
                          (editedData?.montadores || []).map((montador: any, index: number) => (
                            <div key={index} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg border">
                              <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 grid grid-cols-3 gap-3 items-center">
                                {/* Nombre Completo */}
                                <div className="col-span-2">
                                  <dt className="text-xs text-muted-foreground mb-0.5">Nombre Completo</dt>
                                  {isEditMode ? (
                                    <Input
                                      type="text"
                                      value={montador.nombreCompleto || ''}
                                      onChange={(e) => {
                                        const newMontadores = [...editedData!.montadores!];
                                        newMontadores[index].nombreCompleto = e.target.value;
                                        setEditedData({
                                          ...editedData!,
                                          montadores: newMontadores
                                        });
                                      }}
                                      className="font-medium"
                                      placeholder="Nombre y apellidos"
                                    />
                                  ) : (
                                    <dd className="font-medium text-base">
                                      {montador.nombreCompleto || 'N/A'}
                                    </dd>
                                  )}
                                </div>
                                
                                {/* Horas */}
                                <div>
                                  <dt className="text-xs text-muted-foreground mb-0.5">Horas</dt>
                                  {isEditMode ? (
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.5"
                                      value={montador.horas || 0}
                                      onChange={(e) => {
                                        const newMontadores = [...editedData!.montadores!];
                                        newMontadores[index].horas = parseFloat(e.target.value) || 0;
                                        setEditedData({
                                          ...editedData!,
                                          montadores: newMontadores
                                        });
                                      }}
                                      className="font-bold text-blue-600"
                                    />
                                  ) : (
                                    <dd className="font-bold text-lg text-blue-600">
                                      {montador.horas || 0}h
                                    </dd>
                                  )}
                                </div>
                              </div>
                              
                              {/* Botón eliminar en modo edición */}
                              {isEditMode && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive flex-shrink-0"
                                  onClick={() => {
                                    const newMontadores = editedData!.montadores!.filter((_: any, i: number) => i !== index);
                                    setEditedData({
                                      ...editedData!,
                                      montadores: newMontadores
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground italic text-center py-4">
                            No hay montadores registrados
                          </p>
                        )}
                      </div>
                    </Card>

                    {/* Desglose Total de Horas */}
                    <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Clock className="h-4 w-4" />
                        Desglose Total de Horas
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {/* Ordinarias */}
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Ordinarias</p>
                          {isEditMode ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editedData?.horasTotales?.ordinarias || 0}
                              onChange={(e) => setEditedData({
                                ...editedData!,
                                horasTotales: {
                                  ...editedData?.horasTotales!,
                                  ordinarias: parseFloat(e.target.value) || 0
                                }
                              })}
                              className="text-center text-2xl font-bold text-green-600"
                            />
                          ) : (
                            <p className="text-2xl font-bold text-green-600">
                              {editedData?.horasTotales?.ordinarias || 
                               (editedData?.montadores?.reduce((sum, m) => sum + (m.horas || 0), 0) || 0)}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                        
                        {/* Extras */}
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Extras</p>
                          {isEditMode ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editedData?.horasTotales?.extras || 0}
                              onChange={(e) => setEditedData({
                                ...editedData!,
                                horasTotales: {
                                  ...editedData?.horasTotales!,
                                  extras: parseFloat(e.target.value) || 0
                                }
                              })}
                              className="text-center text-2xl font-bold text-orange-600"
                            />
                          ) : (
                            <p className="text-2xl font-bold text-orange-600">
                              {editedData?.horasTotales?.extras || 0}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                        
                        {/* Festivas */}
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Festivas</p>
                          {isEditMode ? (
                            <Input
                              type="number"
                              min="0"
                              step="0.5"
                              value={editedData?.horasTotales?.festivas || 0}
                              onChange={(e) => setEditedData({
                                ...editedData!,
                                horasTotales: {
                                  ...editedData?.horasTotales!,
                                  festivas: parseFloat(e.target.value) || 0
                                }
                              })}
                              className="text-center text-2xl font-bold text-purple-600"
                            />
                          ) : (
                            <p className="text-2xl font-bold text-purple-600">
                              {editedData?.horasTotales?.festivas || 0}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                      </div>
                      
                      {/* Total General */}
                      <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-green-700 dark:text-green-400">Total de Horas:</span>
                          <span className="text-3xl font-bold text-green-600">
                            {((editedData?.horasTotales?.ordinarias || (editedData?.montadores?.reduce((sum, m) => sum + (m.horas || 0), 0) || 0)) + 
                              (editedData?.horasTotales?.extras || 0) + 
                              (editedData?.horasTotales?.festivas || 0)).toFixed(1)}h
                          </span>
                        </div>
                      </div>
                    </Card>
                  </TabsContent>
                  
                  {/* Tab: Trabajo Realizado */}
                  <TabsContent value="trabajo" className="space-y-4 mt-4">
                    <Card className="p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        Descripción del Trabajo
                      </h3>
                      {isEditMode ? (
                        <Textarea
                          value={editedData?.trabajoRealizado || ''}
                          onChange={(e) => setEditedData({
                            ...editedData!,
                            trabajoRealizado: e.target.value
                          })}
                          className="min-h-[200px] text-sm leading-relaxed"
                          placeholder="Ingrese la descripción del trabajo realizado..."
                        />
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">
                          {selectedDoc.meta?.extractedData?.trabajoRealizado || 
                            <span className="text-muted-foreground italic">No se especificó descripción del trabajo</span>}
                        </p>
                      )}
                    </Card>
                  </TabsContent>
                  
                  {/* Tab: Validación y Firmas */}
                  <TabsContent value="validacion" className="space-y-4 mt-4">
                    <Card className="p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <PenTool className="h-4 w-4" />
                        Estado de Firmas
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                          {selectedDoc.meta?.extractedData?.firmas?.montador ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-orange-600" />}
                          <div>
                            <p className="text-xs text-muted-foreground">Firma Montador</p>
                            <p className="font-medium">
                              {selectedDoc.meta?.extractedData?.firmas?.montador ? 'Firmado' : 'Sin firmar'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                          {selectedDoc.meta?.extractedData?.firmas?.cliente ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-orange-600" />}
                          <div>
                            <p className="text-xs text-muted-foreground">Firma Cliente</p>
                            <p className="font-medium">
                              {selectedDoc.meta?.extractedData?.firmas?.cliente ? 'Firmado' : 'Sin firmar'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4" />
                        Estado del Documento
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Estado actual:</span>
                          <Badge variant={selectedDoc.status === 'approved' ? 'default' : selectedDoc.status === 'rejected' ? 'destructive' : 'secondary'}>
                            {selectedDoc.status === 'approved' ? 'Aprobado' : selectedDoc.status === 'rejected' ? 'Rechazado' : 'Pendiente'}
                          </Badge>
                        </div>
                        
                        <div className="pt-3 border-t space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Cambiar estado del documento:
                          </p>
                          <div className="flex gap-2">
                            <Button 
                              onClick={() => handleChangeStatus('pending')}
                              variant="outline"
                              size="sm"
                              disabled={selectedDoc.status === 'pending' || isUpdatingDocument}
                              className="flex-1"
                            >
                              <Clock className="mr-2 h-4 w-4" />
                              Pendiente
                            </Button>
                            
                            <Button 
                              onClick={() => handleChangeStatus('approved')}
                              variant={selectedDoc.status === 'approved' ? 'default' : 'outline'}
                              size="sm"
                              disabled={selectedDoc.status === 'approved' || isUpdatingDocument}
                              className="flex-1"
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Aprobar
                            </Button>
                            
                            <Button 
                              onClick={() => setShowRejectDialog(true)}
                              variant={selectedDoc.status === 'rejected' ? 'destructive' : 'outline'}
                              size="sm"
                              disabled={selectedDoc.status === 'rejected' || isUpdatingDocument}
                              className="flex-1"
                            >
                              <XCircle className="mr-2 h-4 w-4" />
                              Rechazar
                            </Button>
                          </div>
                          
                          <p className="text-xs text-muted-foreground italic">
                            Puedes cambiar el estado en cualquier momento para rectificar la validación
                          </p>
                        </div>
                        
                        {selectedDoc.review_notes && <div className="pt-3 border-t">
                            <p className="text-xs text-muted-foreground mb-1">Notas de revisión:</p>
                            <p className="text-sm">{selectedDoc.review_notes}</p>
                          </div>}
                      </div>
                    </Card>

                    <Card className="p-4 bg-muted/30">
                      <h3 className="font-semibold mb-3 text-sm">Metadatos del Sistema</h3>
                      <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Subido por:</dt>
                          <dd className="font-medium">{selectedDoc.profiles?.full_name || 'N/A'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">Fecha de subida:</dt>
                          <dd className="font-medium">
                            {new Date(selectedDoc.created_at).toLocaleString('es-ES')}
                          </dd>
                        </div>
                        {selectedDoc.validated_at && <div className="flex justify-between">
                            <dt className="text-muted-foreground">Validado:</dt>
                            <dd className="font-medium">
                              {new Date(selectedDoc.validated_at).toLocaleString('es-ES')}
                            </dd>
                          </div>}
                      </dl>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>}
        </DialogContent>
      </Dialog>

      {/* Dialog para rechazar con notas */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar Documento</DialogTitle>
            <DialogDescription>
              Proporciona una razón para el rechazo del documento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="Escribe las razones del rechazo..."
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={4}
              className="w-full"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowRejectDialog(false);
                setRejectNotes('');
              }}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleRejectDocumentWithNotes}
              disabled={!rejectNotes.trim() || isUpdatingDocument}
            >
              {isUpdatingDocument ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rechazando...
                </>
              ) : (
                'Confirmar Rechazo'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>;
};
export default SuperAdminDashboard;