import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, Download, Eye, FileText, Users, Clock, Trash2 } from 'lucide-react';
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
  // Nueva estructura con desglose detallado
  montadores?: Array<{
    nombreCompleto: string;
    horas?: number; // Mantener para compatibilidad
    horasActivas?: {
      normales: number;
      extras: number;
    };
    horasViaje?: {
      normales: number;
      extras: number;
    };
  }>;
  horasTotales?: {
    ordinarias: number;
    extras: number;
    festivas: number;
  };
  desgloseDetallado?: {
    activasNormales: number;
    activasExtras: number;
    viajeNormales: number;
    viajeExtras: number;
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
  updated_at: string;
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
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [userId, setUserId] = useState<string | null>(null);
  useEffect(() => {
    checkAuth();
    loadDocuments();
  }, []);
  useEffect(() => {
    filterDocuments();
  }, [searchTerm, documents]);
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
  const handleViewDetails = (doc: Document) => {
    navigate(`/admin/document/${doc.id}`);
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
      const horasData = extracted?.horasTotales || extracted?.horas;
      const totalHoras = horasData ? horasData.ordinarias + horasData.extras + horasData.festivas : 0;
      return {
        'ID': doc.id,
        'Nº Parte': extracted?.parteNumero || 'N/A',
        'Cliente': extracted?.cliente || 'N/A',
        'Emplazamiento': extracted?.emplazamiento || 'N/A',
        'Obra': extracted?.obra || 'N/A',
        'Trabajo': extracted?.trabajoRealizado || 'N/A',
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
    uniqueClients: new Set(documents.map(d => d.meta?.extractedData?.cliente).filter(Boolean)).size
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

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Parte</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Firmas</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length === 0 ? <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                          <div className="flex gap-1">
                            {extracted?.firmas?.montador && <Badge variant="outline" className="text-xs">M</Badge>}
                            {extracted?.firmas?.cliente && <Badge variant="outline" className="text-xs">C</Badge>}
                            {!extracted?.firmas?.montador && !extracted?.firmas?.cliente && <span className="text-muted-foreground text-xs">Sin firmas</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleViewDetails(doc)} className="rounded-md">
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteDocument(doc.id, doc.storage_path)} className="rounded-md ">
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
    </div>;
};
export default SuperAdminDashboard;