import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import {
  Users,
  LogOut,
  FileText,
  Clock,
  Download,
  Plus,
  Building2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import logoMrd from '@/assets/logo-mrd.jpg';

interface DocumentRecord {
  id: string;
  status: string;
  created_at: string;
  meta: {
    extractedData?: {
      parteNumero?: string;
      cliente?: string;
      obra?: string;
      fecha?: string;
      emplazamiento?: string;
      ordenTrabajo?: string;
      horasTotales?: {
        ordinarias: number;
        extras: number;
        festivas: number;
      };
    };
  } | null;
  profiles?: {
    full_name: string;
  };
}

const ITEMS_PER_PAGE = 10;

export default function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  async function checkAuthAndLoadData() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate('/auth');
      return;
    }

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);

    const hasAccess = roles?.some(
      (r) => r.role === 'superadmin' || r.role === 'admin'
    );

    if (!hasAccess) {
      toast.error('No tienes permisos');
      navigate('/scan');
      return;
    }

    await loadDocuments();
    setIsLoading(false);
  }

  async function loadDocuments() {
    const { data, error } = await supabase
      .from('documents')
      .select('id, status, created_at, meta, uploader, profiles:uploader(full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      toast.error('Error al cargar documentos');
      console.error(error);
      return;
    }

    setDocuments((data || []) as unknown as DocumentRecord[]);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/auth');
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return '-';
    const parts = dateStr.split('/');
    if (parts.length === 3) return dateStr;
    try {
      const date = new Date(dateStr);
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  }

  function calculateTotalHours(doc: DocumentRecord): number {
    const ht = doc.meta?.extractedData?.horasTotales;
    if (ht) {
      return (ht.ordinarias || 0) + (ht.extras || 0) + (ht.festivas || 0);
    }
    return 0;
  }

  const duplicateParteNumbers = useMemo(() => {
    const counts: Record<string, number> = {};
    documents.forEach((doc) => {
      const pn = doc.meta?.extractedData?.parteNumero;
      if (pn) {
        counts[pn] = (counts[pn] || 0) + 1;
      }
    });
    const duplicates = new Set<string>();
    Object.entries(counts).forEach(([pn, count]) => {
      if (count > 1) duplicates.add(pn);
    });
    return duplicates;
  }, [documents]);

  const filteredDocuments = useMemo(() => {
    if (!searchTerm.trim()) return documents;
    const term = searchTerm.toLowerCase();
    return documents.filter((doc) => {
      const ed = doc.meta?.extractedData;
      const parteNumero = ed?.parteNumero?.toLowerCase() || '';
      const cliente = ed?.cliente?.toLowerCase() || '';
      const obra = ed?.obra?.toLowerCase() || '';
      const emplazamiento = ed?.emplazamiento?.toLowerCase() || '';
      const fecha = formatDate(ed?.fecha).toLowerCase();
      return (
        parteNumero.includes(term) ||
        cliente.includes(term) ||
        obra.includes(term) ||
        emplazamiento.includes(term) ||
        fecha.includes(term)
      );
    });
  }, [documents, searchTerm]);

  const totalPages = Math.ceil(filteredDocuments.length / ITEMS_PER_PAGE);
  const paginatedDocuments = filteredDocuments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const pendingCount = documents.filter((d) => d.status === 'pending').length;

  function exportToExcel() {
    const exportData = documents.map((doc) => {
      const ed = doc.meta?.extractedData;
      const total = calculateTotalHours(doc);
      return {
        'N Parte': ed?.parteNumero || '',
        'O.T.': ed?.ordenTrabajo || '',
        Cliente: ed?.cliente || '',
        Obra: ed?.obra || '',
        Fecha: ed?.fecha || '',
        Emplazamiento: ed?.emplazamiento || '',
        'Horas Totales': total,
        Estado: doc.status,
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Documentos');
    XLSX.writeFile(wb, 'documentos_partes.xlsx');
    toast.success('Excel exportado correctamente');
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'validated':
        return <Badge className="bg-primary text-primary-foreground">Validado</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rechazado</Badge>;
      default:
        return <Badge variant="secondary">Pendiente</Badge>;
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={logoMrd}
                alt="Logo MRD"
                className="h-12 object-contain"
              />
              <h1 className="text-lg font-semibold text-foreground">
                Gestor para extraccion de datos de partes de trabajo
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/users')}
              >
                <Users className="h-4 w-4 mr-2" />
                Usuarios
              </Button>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="p-6">
          {/* Stats Row */}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            <h2 className="text-xl font-bold text-foreground">Panel de Control</h2>

            <Card className="px-4 py-2 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Total Documentos</p>
                <p className="text-lg font-bold">{documents.length}</p>
              </div>
            </Card>

            <Card className="px-4 py-2 flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pendientes</p>
                <p className="text-lg font-bold">{pendingCount}</p>
              </div>
            </Card>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/admin/obras')}
              >
                <Building2 className="h-4 w-4 mr-2" />
                Creacion Obra
              </Button>
              <Button variant="outline" size="sm" onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-2" />
                Exportar Excel
              </Button>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => navigate('/admin/processor')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Nuevo Parte
              </Button>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por N Parte, Cliente, Fecha, Obra o Emplazamiento..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-10"
            />
          </div>

          {/* Table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N Parte</TableHead>
                  <TableHead>O.T.</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Horas</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDocuments.map((doc) => {
                  const ed = doc.meta?.extractedData;
                  const pn = ed?.parteNumero || '';
                  const isDuplicate = pn && duplicateParteNumbers.has(pn);
                  const totalHours = calculateTotalHours(doc);

                  return (
                    <TableRow
                      key={doc.id}
                      className={`cursor-pointer ${
                        isDuplicate
                          ? 'bg-orange-50 hover:bg-orange-100'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => navigate(`/admin/document/${doc.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isDuplicate && (
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-4 w-4 text-orange-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                Este parte esta duplicado. Existe otro registro con el mismo N de Parte.
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <span className="font-medium">{pn || '-'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{ed?.ordenTrabajo || '-'}</TableCell>
                      <TableCell>{ed?.cliente || '-'}</TableCell>
                      <TableCell>{ed?.obra || '-'}</TableCell>
                      <TableCell>{formatDate(ed?.fecha)}</TableCell>
                      <TableCell>{totalHours}h</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                    </TableRow>
                  );
                })}
                {paginatedDocuments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No se encontraron documentos
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{' '}
                {Math.min(currentPage * ITEMS_PER_PAGE, filteredDocuments.length)} de{' '}
                {filteredDocuments.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Pagina {currentPage} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </TooltipProvider>
  );
}
