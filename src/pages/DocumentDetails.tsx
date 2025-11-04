import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Download, FileText, User, Briefcase, Calendar, Building, PenTool, ZoomIn, ZoomOut, Loader2, Pencil, Save, XCircle, Shield, Clock, MapPin, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface ExtractedData {
  parteNumero: string | null;
  cliente: string | null;
  emplazamiento: string | null;
  obra: string | null;
  trabajoRealizado: string | null;
  montador?: {
    nombre: string | null;
    apellidos: string | null;
  };
  horas?: {
    ordinarias: number;
    extras: number;
    festivas: number;
  };
  montadores?: Array<{
    nombreCompleto: string;
    horas?: number;
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

const DocumentDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [document, setDocument] = useState<Document | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData | null>(null);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [zoom, setZoom] = useState(100);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);

  const loadDocument = async () => {
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('documents')
        .select(`
          *,
          profiles:uploader (
            full_name
          )
        `)
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error loading document:', error);
        toast.error('Error al cargar el documento');
        navigate('/admin/dashboard');
        return;
      }

      setDocument(data as any);

      // Cargar datos extraídos
      const existingData = (data.meta as any)?.extractedData;
      
      if (existingData) {
        const initialData = JSON.parse(JSON.stringify(existingData));
        
        // Compatibilidad: convertir estructura antigua a nueva
        if (existingData.montador && !existingData.montadores) {
          initialData.montadores = [
            {
              nombreCompleto: `${existingData.montador.nombre || ''} ${existingData.montador.apellidos || ''}`.trim(),
              horas: existingData.horas?.ordinarias || 0
            }
          ];
          
          if (!initialData.horasTotales) {
            initialData.horasTotales = existingData.horas || { ordinarias: 0, extras: 0, festivas: 0 };
          }
        }
        
        setEditedData(initialData);
      } else {
        // Datos vacíos si no hay extractedData
        setEditedData({
          parteNumero: null,
          cliente: null,
          emplazamiento: null,
          obra: null,
          trabajoRealizado: null,
          fecha: null,
          montadores: [],
          horasTotales: { ordinarias: 0, extras: 0, festivas: 0 },
          desgloseDetallado: null,
          firmas: { montador: false, cliente: false }
        });
      }

      // Cargar imagen
      const { data: signedUrlData } = await supabase.storage
        .from('scans')
        .createSignedUrl(data.storage_path, 3600);
      
      if (signedUrlData?.signedUrl) {
        setImageUrl(signedUrlData.signedUrl);
      }
    } catch (error) {
      console.error('Error loading document:', error);
      toast.error('Error inesperado al cargar el documento');
      navigate('/admin/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  const reExtractMontadores = async () => {
    if (!imageUrl) {
      toast.error('No se pudo obtener la URL de la imagen');
      return;
    }

    setIsReextracting(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('validate-document', {
        body: { imageData: imageUrl }
      });

      if (error) {
        console.error('Error reextrayendo montadores:', error);
        toast.error('Error al reextraer montadores desde la imagen');
        return;
      }

      const extractedData = data?.extractedData;
      
      if (extractedData) {
        const updates: any = {};
        let hasUpdates = false;
        let headerUpdates = 0;
        
        const headerFields = ['parteNumero', 'cliente', 'emplazamiento', 'obra', 'trabajoRealizado', 'fecha', 'firmas'];
        headerFields.forEach(field => {
          if (extractedData[field]) {
            updates[field] = extractedData[field];
            if (field !== 'firmas') headerUpdates++;
            hasUpdates = true;
          }
        });
        
        if (extractedData.montadores && extractedData.montadores.length > 1) {
          updates.montadores = extractedData.montadores;
          hasUpdates = true;
          
          updates.horasTotales = extractedData.horasTotales || {
            ordinarias: extractedData.montadores.reduce((sum: number, m: any) => sum + (m.horas || 0), 0),
            extras: 0,
            festivas: 0
          };
        }

        if (hasUpdates) {
          setEditedData(prev => ({
            ...prev!,
            ...updates
          }));
          
          if (extractedData.montadores && extractedData.montadores.length > 1) {
            toast.success(`✅ ${extractedData.montadores.length} montadores extraídos`);
          }
          if (headerUpdates > 0) {
            toast.success(`✅ ${headerUpdates} campos de cabecera actualizados`);
          }
        } else {
          toast.info('ℹ️ No se encontraron datos adicionales en la imagen');
        }
      } else {
        toast.info('ℹ️ No se pudieron extraer datos de la imagen');
      }
    } catch (error) {
      console.error('Error inesperado reextrayendo:', error);
      toast.error('Error inesperado al reextraer datos');
    } finally {
      setIsReextracting(false);
    }
  };

  const handleSaveEditedData = async () => {
    if (!document || !editedData) {
      toast.error('No hay datos para guardar');
      return;
    }

    setIsSavingChanges(true);

    try {
      const { error } = await supabase
        .from('documents')
        .update({
          meta: {
            ...document.meta,
            extractedData: editedData
          } as any
        })
        .eq('id', document.id);

      if (error) {
        console.error('Error saving edited data:', error);
        toast.error('Error al guardar los cambios');
        return;
      }

      setDocument({
        ...document,
        meta: {
          ...document.meta,
          extractedData: editedData
        }
      });

      toast.success('Cambios guardados correctamente');
      setIsEditMode(false);
    } catch (error) {
      console.error('Unexpected error saving data:', error);
      toast.error('Error inesperado al guardar');
    } finally {
      setIsSavingChanges(false);
    }
  };

  const handleCancelEdit = () => {
    setEditedData((document.meta as any)?.extractedData ? JSON.parse(JSON.stringify((document.meta as any).extractedData)) : null);
    setIsEditMode(false);
    toast.info('Cambios descartados');
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 200));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50));
  };

  const handleResetZoom = () => {
    setZoom(100);
  };

  const renderField = (value: string | null | undefined, label: string) => {
    if (!value || value === '') {
      return (
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground italic">N/A</span>
          <Badge variant="outline" className="text-xs text-orange-600 border-orange-600">
            Dato no reconocido
          </Badge>
        </div>
      );
    }
    return <span>{value}</span>;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando documento...</p>
        </div>
      </div>
    );
  }

  if (!document) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate('/admin/dashboard')}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver al Panel
              </Button>
              <div>
                <h1 className="text-xl font-bold flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Datos extraídos del parte
                </h1>
                <p className="text-sm text-muted-foreground">
                  Subido el {new Date(document.created_at).toLocaleDateString('es-ES')}
                </p>
              </div>
            </div>
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
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 h-[calc(100vh-80px)]">
        <div className="grid grid-cols-5 gap-6 h-full">
          {/* Left Column: Image (2/5) - CON SCROLL Y ZOOM FUNCIONAL */}
          <div className="col-span-2 h-full flex flex-col border rounded-lg bg-card">
            {/* Header fijo con controles de zoom */}
            <div className="flex-shrink-0 p-3 border-b bg-muted/50 flex items-center justify-between">
              <span className="text-sm font-medium">Vista Previa del Documento</span>
              <div className="flex items-center gap-2">
                {/* Botón Zoom Out */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoom <= 50}
                  className="h-8 w-8 p-0"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                
                {/* Indicador de zoom clickeable para reset */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetZoom}
                  className="h-8 px-2 text-xs font-mono"
                >
                  {zoom}%
                </Button>
                
                {/* Botón Zoom In */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoom >= 200}
                  className="h-8 w-8 p-0"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                {/* Separador */}
                <div className="h-6 w-px bg-border mx-1" />
                
                {/* Botón descargar compacto */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const imgElement = window.document.createElement('a');
                    imgElement.href = imageUrl;
                    imgElement.download = `documento_${(document.meta as any)?.extractedData?.parteNumero || 'sin-numero'}.jpg`;
                    imgElement.click();
                    toast.success('Descargando imagen...');
                  }}
                  className="h-8 w-8 p-0"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Contenedor scrolleable con imagen zoomeable */}
            <div className="flex-1 overflow-auto bg-muted/20 relative">
              <div className="min-h-full flex items-start justify-center p-4">
                {imageUrl && (
                  <img
                    src={imageUrl}
                    alt="Documento escaneado"
                    className="shadow-lg transition-all duration-200"
                    style={{
                      width: `${zoom}%`,
                      maxWidth: 'none',
                      height: 'auto'
                    }}
                  />
                )}
              </div>
              
              {/* Badge de legibilidad flotante */}
              <div className="absolute top-4 right-4 bg-background/95 backdrop-blur-sm px-3 py-1.5 rounded-full border shadow-sm">
                <div className="flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {document.meta?.legibilityScore}%
                  </span>
                </div>
              </div>
            </div>
            
            {/* Footer fijo con card de calidad */}
            <div className="flex-shrink-0 p-3 border-t bg-muted/30">
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Legibilidad</span>
                    <span className="font-medium">{document.meta?.legibilityScore || 0}%</span>
                  </div>
                  <Progress value={document.meta?.legibilityScore || 0} className="h-2" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Auto-recortado:</span>
                  <Badge variant={document.meta?.hadAutoCrop ? "default" : "secondary"} className="text-xs">
                    {document.meta?.hadAutoCrop ? 'Sí' : 'No'}
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          
          {/* Right Column: Unified Data Card with Scroll */}
          <div className="col-span-3 h-full flex flex-col">
            <ScrollArea className="h-full">
              <div className="p-6 space-y-6">
                
                {/* === SECCIÓN 1: DATOS DEL PARTE === */}
                <Card className="p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 border-b pb-3">
                    <FileText className="h-5 w-5 text-primary" />
                    Datos del Parte
                  </h2>
                  <dl className="space-y-4">
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
                            {(document.meta as any)?.extractedData?.parteNumero || editedData?.parteNumero || 
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
                            {((document.meta as any)?.extractedData?.fecha || editedData?.fecha) ? 
                              new Date((document.meta as any)?.extractedData?.fecha || editedData?.fecha).toLocaleDateString('es-ES', {
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
                            {(document.meta as any)?.extractedData?.cliente || editedData?.cliente || 'N/A'}
                          </dd>
                        )}
                      </div>
                    </div>

                    {/* Emplazamiento */}
                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
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
                            {(document.meta as any)?.extractedData?.emplazamiento || editedData?.emplazamiento || 'N/A'}
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
                            placeholder="Ingrese obra"
                          />
                        ) : (
                          <dd className="font-medium">
                            {(document.meta as any)?.extractedData?.obra || editedData?.obra || 'N/A'}
                          </dd>
                        )}
                      </div>
                    </div>
                  </dl>
                </Card>

                {/* === SECCIÓN 2: TRABAJO REALIZADO === */}
                <Card className="p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 border-b pb-3">
                    <Briefcase className="h-5 w-5 text-primary" />
                    Trabajo Realizado
                  </h2>
                  
                  {/* Descripción del trabajo */}
                  <div className="mb-6">
                    {isEditMode ? (
                      <Textarea
                        value={editedData?.trabajoRealizado || ''}
                        onChange={(e) => setEditedData({
                          ...editedData!,
                          trabajoRealizado: e.target.value
                        })}
                        className="min-h-[200px]"
                        placeholder="Descripción del trabajo realizado"
                      />
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {(document.meta as any)?.extractedData?.trabajoRealizado || editedData?.trabajoRealizado || 
                          <span className="text-muted-foreground italic">No hay descripción del trabajo</span>}
                      </p>
                    )}
                  </div>

                  {/* Estado de Firmas */}
                  <div>
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <PenTool className="h-4 w-4" />
                      Estado de Firmas
                    </h3>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between py-2 border-b">
                        <span className="text-sm">Firma del Montador</span>
                        <Badge variant={editedData?.firmas?.montador ? "default" : "secondary"}>
                          {editedData?.firmas?.montador ? 'Firmado' : 'No firmado'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm">Firma del Cliente</span>
                        <Badge variant={editedData?.firmas?.cliente ? "default" : "secondary"}>
                          {editedData?.firmas?.cliente ? 'Firmado' : 'No firmado'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </Card>

                {/* === SECCIÓN 3: DATOS DE MONTADORES === */}
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4 border-b pb-3">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <User className="h-5 w-5 text-primary" />
                      Datos de Montadores
                    </h2>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={reExtractMontadores}
                      disabled={isReextracting}
                    >
                      {isReextracting ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          Reextrayendo...
                        </>
                      ) : (
                        'Reextraer desde imagen'
                      )}
                    </Button>
                  </div>

                  {/* Listado de montadores individuales */}
                  {editedData?.montadores && editedData.montadores.length > 0 ? (
                    <div className="space-y-3 mb-6">
                      {editedData.montadores.map((montador, index) => (
                        <div key={index} className="border rounded-lg p-4 bg-muted/20 hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-6">
                            {/* IZQUIERDA: Nombre del montador */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <User className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <dt className="text-xs text-muted-foreground mb-0.5">
                                  Montador {editedData.montadores!.length > 1 ? `#${index + 1}` : ''}
                                </dt>
                                {isEditMode ? (
                                  <Input
                                    type="text"
                                    value={montador.nombreCompleto || ''}
                                    onChange={(e) => {
                                      const newMontadores = [...editedData.montadores!];
                                      newMontadores[index] = {
                                        ...newMontadores[index],
                                        nombreCompleto: e.target.value
                                      };
                                      setEditedData({
                                        ...editedData,
                                        montadores: newMontadores
                                      });
                                    }}
                                    className="font-medium"
                                    placeholder="Nombre completo del montador"
                                  />
                                ) : (
                                  <dd className="font-medium truncate">
                                    {montador.nombreCompleto || 'N/A'}
                                  </dd>
                                )}
                              </div>
                            </div>

                            {/* DERECHA: Desglose de horas */}
                            <div className="flex items-center gap-4 flex-shrink-0">
                              {/* Horas Activas */}
                              <div className="text-center">
                                <div className="text-xs text-muted-foreground mb-1 font-medium">H. Activas</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-muted-foreground uppercase">N</span>
                                    {isEditMode ? (
                                      <Input
                                        type="number"
                                        value={montador.horasActivas?.normales ?? 0}
                                        onChange={(e) => {
                                          const newMontadores = [...editedData.montadores!];
                                          newMontadores[index] = {
                                            ...newMontadores[index],
                                            horasActivas: {
                                              ...newMontadores[index].horasActivas,
                                              normales: parseFloat(e.target.value) || 0,
                                              extras: newMontadores[index].horasActivas?.extras ?? 0
                                            }
                                          };
                                          setEditedData({
                                            ...editedData,
                                            montadores: newMontadores
                                          });
                                        }}
                                        className="w-14 h-8 text-center text-sm font-semibold"
                                        min="0"
                                        step="0.5"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold text-blue-600">
                                        {montador.horasActivas?.normales ?? 0}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-muted-foreground">/</span>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-muted-foreground uppercase">Ex</span>
                                    {isEditMode ? (
                                      <Input
                                        type="number"
                                        value={montador.horasActivas?.extras ?? 0}
                                        onChange={(e) => {
                                          const newMontadores = [...editedData.montadores!];
                                          newMontadores[index] = {
                                            ...newMontadores[index],
                                            horasActivas: {
                                              normales: newMontadores[index].horasActivas?.normales ?? 0,
                                              extras: parseFloat(e.target.value) || 0
                                            }
                                          };
                                          setEditedData({
                                            ...editedData,
                                            montadores: newMontadores
                                          });
                                        }}
                                        className="w-14 h-8 text-center text-sm font-semibold"
                                        min="0"
                                        step="0.5"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold text-orange-600">
                                        {montador.horasActivas?.extras ?? 0}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Separador vertical */}
                              <div className="h-12 w-px bg-border" />

                              {/* Horas de Viaje */}
                              <div className="text-center">
                                <div className="text-xs text-muted-foreground mb-1 font-medium">H. Viaje</div>
                                <div className="flex items-center gap-2">
                                  <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-muted-foreground uppercase">N</span>
                                    {isEditMode ? (
                                      <Input
                                        type="number"
                                        value={montador.horasViaje?.normales ?? 0}
                                        onChange={(e) => {
                                          const newMontadores = [...editedData.montadores!];
                                          newMontadores[index] = {
                                            ...newMontadores[index],
                                            horasViaje: {
                                              ...newMontadores[index].horasViaje,
                                              normales: parseFloat(e.target.value) || 0,
                                              extras: newMontadores[index].horasViaje?.extras ?? 0
                                            }
                                          };
                                          setEditedData({
                                            ...editedData,
                                            montadores: newMontadores
                                          });
                                        }}
                                        className="w-14 h-8 text-center text-sm font-semibold"
                                        min="0"
                                        step="0.5"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold text-blue-600">
                                        {montador.horasViaje?.normales ?? 0}
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-muted-foreground">/</span>
                                  <div className="flex flex-col items-center">
                                    <span className="text-[10px] text-muted-foreground uppercase">Ex</span>
                                    {isEditMode ? (
                                      <Input
                                        type="number"
                                        value={montador.horasViaje?.extras ?? 0}
                                        onChange={(e) => {
                                          const newMontadores = [...editedData.montadores!];
                                          newMontadores[index] = {
                                            ...newMontadores[index],
                                            horasViaje: {
                                              normales: newMontadores[index].horasViaje?.normales ?? 0,
                                              extras: parseFloat(e.target.value) || 0
                                            }
                                          };
                                          setEditedData({
                                            ...editedData,
                                            montadores: newMontadores
                                          });
                                        }}
                                        className="w-14 h-8 text-center text-sm font-semibold"
                                        min="0"
                                        step="0.5"
                                      />
                                    ) : (
                                      <span className="text-sm font-semibold text-orange-600">
                                        {montador.horasViaje?.extras ?? 0}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : editedData?.montador ? (
                    <div className="space-y-3 mb-6">
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-primary mt-0.5" />
                        <div className="flex-1">
                          <dt className="text-xs text-muted-foreground mb-0.5">Nombre</dt>
                          <dd className="font-medium">
                            {renderField(editedData.montador.nombre, 'Nombre')}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-primary mt-0.5" />
                        <div className="flex-1">
                          <dt className="text-xs text-muted-foreground mb-0.5">Apellidos</dt>
                          <dd className="font-medium">
                            {renderField(editedData.montador.apellidos, 'Apellidos')}
                          </dd>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm mb-6">No hay datos de montador disponibles</p>
                  )}

                  {/* Horas Totales Trabajadas */}
                  <div className="border-t pt-6">
                    <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Horas Totales Trabajadas
                    </h3>
                    <dl className="space-y-2">
                      {editedData?.montadores && editedData.montadores.length > 0 ? (
                        <>
                          {/* Calcular totales automáticamente */}
                          {(() => {
                            const totales = editedData.montadores.reduce((acc, montador) => ({
                              activasNormales: acc.activasNormales + (montador.horasActivas?.normales ?? 0),
                              activasExtras: acc.activasExtras + (montador.horasActivas?.extras ?? 0),
                              viajeNormales: acc.viajeNormales + (montador.horasViaje?.normales ?? 0),
                              viajeExtras: acc.viajeExtras + (montador.horasViaje?.extras ?? 0)
                            }), {
                              activasNormales: 0,
                              activasExtras: 0,
                              viajeNormales: 0,
                              viajeExtras: 0
                            });

                            return (
                              <>
                                {/* Horas Activas (N) */}
                                <div className="flex justify-between items-center py-2 border-b">
                                  <dt className="text-sm text-muted-foreground">Horas Activas (N)</dt>
                                  <dd className="font-medium text-blue-600">
                                    {totales.activasNormales}h
                                  </dd>
                                </div>

                                {/* Horas Activas (Ex) */}
                                <div className="flex justify-between items-center py-2 border-b">
                                  <dt className="text-sm text-muted-foreground">Horas Activas (Ex)</dt>
                                  <dd className="font-medium text-orange-600">
                                    {totales.activasExtras}h
                                  </dd>
                                </div>

                                {/* Horas de Viaje (N) */}
                                <div className="flex justify-between items-center py-2 border-b">
                                  <dt className="text-sm text-muted-foreground">Horas de Viaje (N)</dt>
                                  <dd className="font-medium text-blue-600">
                                    {totales.viajeNormales}h
                                  </dd>
                                </div>

                                {/* Horas de Viaje (Ex) */}
                                <div className="flex justify-between items-center py-2 border-b">
                                  <dt className="text-sm text-muted-foreground">Horas de Viaje (Ex)</dt>
                                  <dd className="font-medium text-orange-600">
                                    {totales.viajeExtras}h
                                  </dd>
                                </div>

                                {/* Total General */}
                                <div className="flex justify-between items-center pt-3 border-t-2">
                                  <dt className="font-semibold">Total</dt>
                                  <dd className="font-bold text-lg">
                                    {totales.activasNormales + 
                                     totales.activasExtras + 
                                     totales.viajeNormales + 
                                     totales.viajeExtras}h
                                  </dd>
                                </div>
                              </>
                            );
                          })()}
                        </>
                      ) : (
                        <p className="text-muted-foreground text-sm">No hay datos de montadores disponibles</p>
                      )}
                    </dl>
                  </div>
                </Card>

                {/* === SECCIÓN 4: METADATOS DE VALIDACIÓN === */}
                <Card className="p-6">
                  <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 border-b pb-3">
                    <Shield className="h-5 w-5 text-primary" />
                    Metadatos de Validación
                  </h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd>
                        <Badge variant={
                          document.status === 'approved' ? 'default' :
                          document.status === 'rejected' ? 'destructive' :
                          'secondary'
                        }>
                          {document.status === 'approved' ? 'Aprobado' :
                           document.status === 'rejected' ? 'Rechazado' :
                           'Pendiente'}
                        </Badge>
                      </dd>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <dt className="text-muted-foreground">Legibilidad</dt>
                      <dd className="font-medium">{document.meta?.legibilityScore || 0}%</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <dt className="text-muted-foreground">Auto-recortado</dt>
                      <dd className="font-medium">{document.meta?.hadAutoCrop ? 'Sí' : 'No'}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <dt className="text-muted-foreground">Subido por</dt>
                      <dd className="font-medium">{document.profiles?.full_name || 'N/A'}</dd>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <dt className="text-muted-foreground">Fecha de subida</dt>
                      <dd className="font-medium">
                        {new Date(document.created_at).toLocaleString('es-ES')}
                      </dd>
                    </div>
                    {document.validated_at && (
                      <div className="flex justify-between py-2">
                        <dt className="text-muted-foreground">Validado el</dt>
                        <dd className="font-medium">
                          {new Date(document.validated_at).toLocaleString('es-ES')}
                        </dd>
                      </div>
                    )}
                  </dl>
                  
                  {/* Notas de Revisión (si existen) */}
                  {document.review_notes && (
                    <div className="mt-6 pt-6 border-t">
                      <h3 className="font-semibold text-sm mb-2">Notas de Revisión</h3>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {document.review_notes}
                      </p>
                    </div>
                  )}
                </Card>

              </div>
            </ScrollArea>
          </div>
        </div>
      </main>
    </div>
  );
};

export default DocumentDetails;
