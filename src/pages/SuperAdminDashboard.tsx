import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LogOut, Download, Eye, FileText, Users, Clock, Trash2, Plus, Search, AlertTriangle, Building } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import logoMrd from '@/assets/logo-mrd.jpg';
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
    inspector: boolean;
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
        
        // Formatear fecha para búsqueda
        const fechaFormateada = extractedData.fecha 
          ? new Date(extractedData.fecha).toLocaleDateString('es-ES') 
          : '';
        
        return extractedData.parteNumero?.toLowerCase().includes(term) || extractedData.cliente?.toLowerCase().includes(term) || extractedData.emplazamiento?.toLowerCase().includes(term) || extractedData.obra?.toLowerCase().includes(term) || fechaFormateada.toLowerCase().includes(term) || extractedData.montador?.nombre?.toLowerCase().includes(term) || extractedData.montador?.apellidos?.toLowerCase().includes(term) || doc.profiles?.full_name?.toLowerCase().includes(term);
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
  const exportToExcel = () => {
    const excelData = filteredDocuments.map(doc => {
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
        'Subido por': doc.profiles?.full_name || 'N/A',
        'Fecha Subida': new Date(doc.created_at).toLocaleString('es-ES'),
        'Validado': doc.validated_at ? new Date(doc.validated_at).toLocaleString('es-ES') : 'No'
      };
    });
    if (excelData.length === 0) {
      toast.error('No hay documentos para exportar');
      return;
    }

    // Crear el libro de trabajo
    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos');

    // Aplicar formato a los encabezados
    const headerRange = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let col = headerRange.s.c; col <= headerRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({
        r: 0,
        c: col
      });
      if (!ws[cellAddress]) continue;
      ws[cellAddress].s = {
        font: {
          bold: true
        },
        alignment: {
          horizontal: 'center',
          vertical: 'center'
        },
        fill: {
          fgColor: {
            rgb: 'E8E8E8'
          }
        }
      };
    }

    // Ajustar ancho de columnas
    const colWidths = Object.keys(excelData[0]).map(key => ({
      wch: Math.max(key.length, ...excelData.map(row => String(row[key as keyof typeof row]).length)) + 2
    }));
    ws['!cols'] = colWidths;

    // Generar nombre del archivo con fecha
    const today = new Date();
    const dateString = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;
    const fileName = `Exportacion_Datos_${dateString}.xlsx`;

    // Descargar el archivo
    XLSX.writeFile(wb, fileName);
    toast.success('Archivo Excel descargado correctamente');
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

  // Función para detectar partes duplicados
  const getDuplicateParteNumeros = (): Set<string> => {
    const parteNumeroCounts: Record<string, number> = {};
    
    // Contar ocurrencias de cada Nº de Parte
    documents.forEach(doc => {
      const parteNumero = doc.meta?.extractedData?.parteNumero;
      if (parteNumero) {
        parteNumeroCounts[parteNumero] = (parteNumeroCounts[parteNumero] || 0) + 1;
      }
    });
    
    // Devolver solo los que aparecen más de una vez
    const duplicates = new Set<string>();
    Object.entries(parteNumeroCounts).forEach(([parteNumero, count]) => {
      if (count > 1) {
        duplicates.add(parteNumero);
      }
    });
    
    return duplicates;
  };

  const duplicateParteNumeros = getDuplicateParteNumeros();
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
            <div className="flex items-center gap-4">
              <img 
                src={logoMrd} 
                alt="MRD Estructuras Tubulares" 
                className="h-12 w-auto object-contain"
              />
              <h1 className="text-2xl font-bold">Gestor para extracción de datos de partes de trabajo</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/users')}>
                <Users className="mr-2 h-4 w-4" />
                Usuarios
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
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-xl font-bold">Panel de Control</h2>
            
            <Card className="px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Documentos</p>
                </div>
              </div>
            </Card>

            <Card className="px-4 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div>
                  <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={exportToExcel}>
              <Download className="mr-2 h-4 w-4" />
              Exportar Excel
            </Button>

            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate('/admin/obras')}
            >
              <Building className="h-5 w-5 mr-2" />
              Creación Obra
            </Button>

            <Button 
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => navigate('/admin/processor')}
            >
              <Plus className="h-5 w-5 mr-2" />
              Nuevo Parte
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Buscar por Nº Parte, Cliente, Fecha, Obra o Emplazamiento..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
              <TableHead>ACCIONES</TableHead>
              <TableHead>Nº PARTE</TableHead>
              <TableHead>CLIENTE</TableHead>
              <TableHead>OBRA</TableHead>
              <TableHead>FECHA</TableHead>
              <TableHead>ESTADO</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length === 0 ? <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No se encontraron documentos
                    </TableCell>
                  </TableRow> : filteredDocuments.map(doc => {
                const extracted = doc.meta?.extractedData;
                const parteNumero = extracted?.parteNumero;
                const isDuplicate = parteNumero ? duplicateParteNumeros.has(parteNumero) : false;
                
                return <TableRow 
                  key={doc.id}
                  className={isDuplicate ? 'bg-orange-50 hover:bg-orange-100' : ''}
                >
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="sm" variant="info" onClick={() => handleViewDetails(doc)}>
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                            <Button size="sm" variant="destructive" onClick={() => handleDeleteDocument(doc.id, doc.storage_path)} className="rounded-md bg-red-400 hover:bg-red-300 text-white">
                              <Trash2 className="h-4 w-4 mr-1" />
                              Eliminar
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {isDuplicate && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-5 w-5 text-orange-500 flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>Este parte está duplicado. Existe otro registro con el mismo Nº de Parte.</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {extracted?.parteNumero || <span className="text-muted-foreground">N/A</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {extracted?.cliente || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.obra || <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {extracted?.fecha ? new Date(extracted.fecha).toLocaleDateString('es-ES') : <span className="text-muted-foreground">N/A</span>}
                        </TableCell>
                        <TableCell>
                          {doc.validated_at ? <Badge className="rounded-md bg-primary hover:bg-primary/90 text-primary-foreground border-primary h-9 px-3 text-sm min-w-[110px] justify-center">
                              Validado
                            </Badge> : <Badge className="rounded-md bg-orange-400 hover:bg-orange-400 text-white border-orange-400 h-9 px-3 text-sm min-w-[110px] justify-center">
                              Pendiente
                            </Badge>}
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