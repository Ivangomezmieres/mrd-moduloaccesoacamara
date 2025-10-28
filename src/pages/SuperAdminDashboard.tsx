import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogOut, Download, Filter, Search, Eye, BarChart3, FileText, Users, Clock, CheckCircle, AlertCircle, User, Building, Briefcase, Calendar, PenTool, ZoomIn, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
interface ExtractedData {
  parteNumero: string | null;
  cliente: string | null;
  emplazamiento: string | null;
  obra: string | null;
  trabajoRealizado: string | null;
  montador: {
    nombre: string | null;
    apellidos: string | null;
  };
  horas: {
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
    const {
      data
    } = await supabase.storage.from('scans').createSignedUrl(doc.storage_path, 3600);
    if (data?.signedUrl) {
      setImageUrl(data.signedUrl);
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
      const totalHoras = extracted?.horas ? extracted.horas.ordinarias + extracted.horas.extras + extracted.horas.festivas : 0;
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
        'Horas Ordinarias': extracted?.horas?.ordinarias || 0,
        'Horas Extras': extracted?.horas?.extras || 0,
        'Horas Festivas': extracted?.horas?.festivas || 0,
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
      const horas = d.meta?.extractedData?.horas;
      if (!horas) return acc;
      return acc + horas.ordinarias + horas.extras + horas.festivas;
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
              <Button variant="outline" onClick={() => navigate('/review')}>
                <FileText className="mr-2 h-4 w-4" />
                Revisar
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
                const totalHoras = extracted?.horas ? extracted.horas.ordinarias + extracted.horas.extras + extracted.horas.festivas : 0;
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
                                {extracted?.horas?.ordinarias}+{extracted?.horas?.extras}+{extracted?.horas?.festivas}
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
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteDocument(doc.id, doc.storage_path)} className="text-slate-50 bg-slate-50">
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
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Detalles Completos del Documento
            </DialogTitle>
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
                        <div className="flex items-start gap-3">
                          <FileText className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Nº de Parte</dt>
                            <dd className="font-semibold text-lg">
                              {selectedDoc.meta?.extractedData?.parteNumero || <span className="text-muted-foreground text-base">N/A</span>}
                            </dd>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Calendar className="h-4 w-4 text-primary mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Fecha del Parte</dt>
                            <dd className="font-medium">
                              {selectedDoc.meta?.extractedData?.fecha ? new Date(selectedDoc.meta.extractedData.fecha).toLocaleDateString('es-ES', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          }) : 'N/A'}
                            </dd>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Building className="h-4 w-4 text-blue-600 mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Cliente</dt>
                            <dd className="font-medium text-blue-600">
                              {selectedDoc.meta?.extractedData?.cliente || 'N/A'}
                            </dd>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Building className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Emplazamiento</dt>
                            <dd className="font-medium">
                              {selectedDoc.meta?.extractedData?.emplazamiento || 'N/A'}
                            </dd>
                          </div>
                        </div>

                        <div className="flex items-start gap-3">
                          <Briefcase className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <dt className="text-xs text-muted-foreground mb-0.5">Obra</dt>
                            <dd className="font-medium">
                              {selectedDoc.meta?.extractedData?.obra || 'N/A'}
                            </dd>
                          </div>
                        </div>
                      </dl>
                    </Card>
                  </TabsContent>
                  
                  {/* Tab: Montador y Horas */}
                  <TabsContent value="montador" className="space-y-4 mt-4">
                    <Card className="p-4">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Datos del Montador
                      </h3>
                      <dl className="space-y-3">
                        <div>
                          <dt className="text-xs text-muted-foreground mb-0.5">Nombre completo</dt>
                          <dd className="font-medium text-lg">
                            {selectedDoc.meta?.extractedData?.montador ? `${selectedDoc.meta.extractedData.montador.nombre || ''} ${selectedDoc.meta.extractedData.montador.apellidos || ''}`.trim() || 'N/A' : 'N/A'}
                          </dd>
                        </div>
                      </dl>
                    </Card>

                    <Card className="p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                      <h3 className="font-semibold mb-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                        <Clock className="h-4 w-4" />
                        Desglose de Horas
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Ordinarias</p>
                          <p className="text-2xl font-bold text-green-600">
                            {selectedDoc.meta?.extractedData?.horas?.ordinarias || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Extras</p>
                          <p className="text-2xl font-bold text-orange-600">
                            {selectedDoc.meta?.extractedData?.horas?.extras || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                        <div className="text-center p-3 bg-background rounded-lg border">
                          <p className="text-xs text-muted-foreground mb-1">Festivas</p>
                          <p className="text-2xl font-bold text-purple-600">
                            {selectedDoc.meta?.extractedData?.horas?.festivas || 0}
                          </p>
                          <p className="text-xs text-muted-foreground">horas</p>
                        </div>
                      </div>
                      <div className="mt-4 pt-4 border-t border-green-200 dark:border-green-800">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-green-700 dark:text-green-400">Total de Horas:</span>
                          <span className="text-3xl font-bold text-green-600">
                            {(selectedDoc.meta?.extractedData?.horas?.ordinarias || 0) + (selectedDoc.meta?.extractedData?.horas?.extras || 0) + (selectedDoc.meta?.extractedData?.horas?.festivas || 0)}h
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
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedDoc.meta?.extractedData?.trabajoRealizado || <span className="text-muted-foreground italic">No se especificó descripción del trabajo</span>}
                      </p>
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
                          <Badge variant={selectedDoc.status === 'approved' ? 'default' : selectedDoc.status === 'pending' ? 'secondary' : 'destructive'} className="text-sm">
                            {selectedDoc.status === 'approved' ? 'Aprobado' : selectedDoc.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                          </Badge>
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
    </div>;
};
export default SuperAdminDashboard;