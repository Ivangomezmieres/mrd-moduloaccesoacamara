import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  LogOut, 
  Download, 
  Filter,
  Search,
  Eye,
  BarChart3,
  FileText,
  Users,
  Clock
} from 'lucide-react';
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
    }
  };

  const loadDocuments = async () => {
    setIsLoading(true);
    
    const { data, error } = await supabase
      .from('documents')
      .select(`
        *,
        profiles:uploader (
          full_name
        )
      `)
      .order('created_at', { ascending: false });

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

        return (
          extractedData.parteNumero?.toLowerCase().includes(term) ||
          extractedData.cliente?.toLowerCase().includes(term) ||
          extractedData.emplazamiento?.toLowerCase().includes(term) ||
          extractedData.obra?.toLowerCase().includes(term) ||
          extractedData.montador?.nombre?.toLowerCase().includes(term) ||
          extractedData.montador?.apellidos?.toLowerCase().includes(term) ||
          doc.profiles?.full_name?.toLowerCase().includes(term)
        );
      });
    }

    setFilteredDocuments(filtered);
  };

  const handleViewDetails = async (doc: Document) => {
    setSelectedDoc(doc);
    
    const { data } = await supabase.storage
      .from('scans')
      .createSignedUrl(doc.storage_path, 3600);
    
    if (data?.signedUrl) {
      setImageUrl(data.signedUrl);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  const exportToCSV = () => {
    const csvData = filteredDocuments.map(doc => {
      const extracted = doc.meta?.extractedData;
      const totalHoras = extracted?.horas 
        ? extracted.horas.ordinarias + extracted.horas.extras + extracted.horas.festivas
        : 0;

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
    const rows = csvData.map(row => 
      Object.values(row).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    ).join('\n');
    
    const csvContent = `${headers}\n${rows}`;
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
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
    avgLegibility: documents.length > 0
      ? Math.round(documents.reduce((acc, d) => acc + (d.meta?.legibilityScore || 0), 0) / documents.length)
      : 0,
    totalHours: documents.reduce((acc, d) => {
      const horas = d.meta?.extractedData?.horas;
      if (!horas) return acc;
      return acc + horas.ordinarias + horas.extras + horas.festivas;
    }, 0),
    uniqueClients: new Set(
      documents
        .map(d => d.meta?.extractedData?.cliente)
        .filter(Boolean)
    ).size,
    uniqueMontadores: new Set(
      documents
        .map(d => {
          const m = d.meta?.extractedData?.montador;
          return m ? `${m.nombre} ${m.apellidos}` : null;
        })
        .filter(Boolean)
    ).size
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Total Horas</p>
                <p className="text-3xl font-bold">{stats.totalHours}h</p>
              </div>
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Legibilidad Media</p>
                <p className="text-3xl font-bold text-green-600">{stats.avgLegibility}%</p>
              </div>
              <Eye className="h-8 w-8 text-green-600" />
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Aprobados</p>
            <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Clientes Únicos</p>
            <p className="text-2xl font-bold">{stats.uniqueClients}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-muted-foreground mb-1">Montadores</p>
            <p className="text-2xl font-bold">{stats.uniqueMontadores}</p>
          </Card>
        </div>

        <Card className="p-4 mb-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente, montador, nº parte..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
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
          
          <div className="mt-2 text-sm text-muted-foreground">
            Mostrando {filteredDocuments.length} de {documents.length} documentos
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
                  <TableHead>Legibilidad</TableHead>
                  <TableHead>Firmas</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No se encontraron documentos
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map(doc => {
                    const extracted = doc.meta?.extractedData;
                    const totalHoras = extracted?.horas 
                      ? extracted.horas.ordinarias + extracted.horas.extras + extracted.horas.festivas
                      : 0;

                    return (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {extracted?.parteNumero || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.cliente || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.montador 
                            ? `${extracted.montador.nombre || ''} ${extracted.montador.apellidos || ''}`.trim()
                            : <span className="text-muted-foreground">N/A</span>
                          }
                        </TableCell>
                        <TableCell>
                          {extracted?.fecha 
                            ? new Date(extracted.fecha).toLocaleDateString('es-ES')
                            : <span className="text-muted-foreground">N/A</span>
                          }
                        </TableCell>
                        <TableCell>
                          {totalHoras > 0 ? (
                            <div className="text-sm">
                              <div className="font-medium">{totalHoras}h</div>
                              <div className="text-xs text-muted-foreground">
                                {extracted?.horas?.ordinarias}+{extracted?.horas?.extras}+{extracted?.horas?.festivas}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">0h</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            doc.status === 'approved' ? 'default' : 
                            doc.status === 'pending' ? 'secondary' : 
                            'destructive'
                          }>
                            {doc.status === 'approved' ? 'Aprobado' : 
                             doc.status === 'pending' ? 'Pendiente' : 
                             'Rechazado'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={
                            doc.meta?.legibilityScore >= 90 ? 'text-green-600 font-medium' :
                            doc.meta?.legibilityScore >= 80 ? 'text-yellow-600' :
                            'text-red-600'
                          }>
                            {doc.meta?.legibilityScore || 0}%
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {extracted?.firmas?.montador && (
                              <Badge variant="outline" className="text-xs">M</Badge>
                            )}
                            {extracted?.firmas?.cliente && (
                              <Badge variant="outline" className="text-xs">C</Badge>
                            )}
                            {!extracted?.firmas?.montador && !extracted?.firmas?.cliente && (
                              <span className="text-muted-foreground text-xs">Sin firmas</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleViewDetails(doc)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>

      <Dialog open={!!selectedDoc} onOpenChange={() => setSelectedDoc(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Documento</DialogTitle>
          </DialogHeader>
          
          {selectedDoc && (
            <div className="space-y-6">
              {imageUrl && (
                <div className="border rounded-lg overflow-hidden">
                  <img 
                    src={imageUrl} 
                    alt="Documento escaneado" 
                    className="w-full h-auto"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Información General</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Nº de Parte:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.parteNumero || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Cliente:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.cliente || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Emplazamiento:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.emplazamiento || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Obra:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.obra || 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Fecha:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.fecha 
                          ? new Date(selectedDoc.meta.extractedData.fecha).toLocaleDateString('es-ES')
                          : 'N/A'}
                      </dd>
                    </div>
                  </dl>
                </Card>

                <Card className="p-4">
                  <h3 className="font-semibold mb-3">Montador y Horas</h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Montador:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.montador
                          ? `${selectedDoc.meta.extractedData.montador.nombre || ''} ${selectedDoc.meta.extractedData.montador.apellidos || ''}`.trim()
                          : 'N/A'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Horas Ordinarias:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.horas?.ordinarias || 0}h
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Horas Extras:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.horas?.extras || 0}h
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Horas Festivas:</dt>
                      <dd className="font-medium">
                        {selectedDoc.meta?.extractedData?.horas?.festivas || 0}h
                      </dd>
                    </div>
                    <div className="pt-2 border-t">
                      <dt className="text-muted-foreground">Total Horas:</dt>
                      <dd className="font-bold text-lg">
                        {(selectedDoc.meta?.extractedData?.horas?.ordinarias || 0) +
                         (selectedDoc.meta?.extractedData?.horas?.extras || 0) +
                         (selectedDoc.meta?.extractedData?.horas?.festivas || 0)}h
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Trabajo Realizado</h3>
                <p className="text-sm">
                  {selectedDoc.meta?.extractedData?.trabajoRealizado || 'No especificado'}
                </p>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Información Técnica</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Estado:</p>
                    <Badge variant={
                      selectedDoc.status === 'approved' ? 'default' : 
                      selectedDoc.status === 'pending' ? 'secondary' : 
                      'destructive'
                    }>
                      {selectedDoc.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Legibilidad:</p>
                    <p className="font-medium">{selectedDoc.meta?.legibilityScore || 0}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Auto-recortado:</p>
                    <p className="font-medium">
                      {selectedDoc.meta?.hadAutoCrop ? 'Sí' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Firmas:</p>
                    <div className="flex gap-1 mt-1">
                      {selectedDoc.meta?.extractedData?.firmas?.montador && (
                        <Badge variant="outline" className="text-xs">Montador</Badge>
                      )}
                      {selectedDoc.meta?.extractedData?.firmas?.cliente && (
                        <Badge variant="outline" className="text-xs">Cliente</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3">Metadatos del Sistema</h3>
                <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Subido por:</dt>
                    <dd className="font-medium">{selectedDoc.profiles?.full_name || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Fecha de subida:</dt>
                    <dd className="font-medium">
                      {new Date(selectedDoc.created_at).toLocaleString('es-ES')}
                    </dd>
                  </div>
                  {selectedDoc.validated_at && (
                    <div>
                      <dt className="text-muted-foreground">Validado:</dt>
                      <dd className="font-medium">
                        {new Date(selectedDoc.validated_at).toLocaleString('es-ES')}
                      </dd>
                    </div>
                  )}
                  {selectedDoc.review_notes && (
                    <div className="col-span-2">
                      <dt className="text-muted-foreground">Notas de revisión:</dt>
                      <dd className="font-medium">{selectedDoc.review_notes}</dd>
                    </div>
                  )}
                </dl>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SuperAdminDashboard;