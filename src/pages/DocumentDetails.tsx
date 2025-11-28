import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Download, FileText, User, Briefcase, Calendar, Building, PenTool, ZoomIn, ZoomOut, Loader2, Pencil, Save, XCircle, Shield, Clock, MapPin, Eye, Lock, Cloud, RotateCcw, RotateCw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
interface ExtractedData {
  parteNumero: string | null;
  cliente: string | null;
  emplazamiento: string | null;
  obra: string | null;
  trabajoRealizado: string | null;
  horario: string | null;
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
    manuallyValidated?: boolean;
  };
  profiles?: {
    full_name: string;
  };
}
const DocumentDetails = () => {
  const navigate = useNavigate();
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const [document, setDocument] = useState<Document | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedData | null>(null);
  const [isSavingChanges, setIsSavingChanges] = useState(false);
  const [isReextracting, setIsReextracting] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isManuallyValidated, setIsManuallyValidated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);
  const loadDocument = async () => {
    setIsLoading(true);
    try {
      const {
        data,
        error
      } = await supabase.from('documents').select(`
          *,
          profiles:uploader (
            full_name
          )
        `).eq('id', id).single();
      if (error) {
        console.error('Error loading document:', error);
        toast.error('Error al cargar el documento');
        navigate('/admin/dashboard');
        return;
      }
      setDocument(data as any);

      // Cargar estado de validación manual
      setIsManuallyValidated((data.meta as any)?.manuallyValidated || false);

      // Cargar rotación guardada
      const savedRotation = (data.meta as any)?.rotation || 0;
      setRotation(savedRotation);

      // Cargar datos extraídos
      const existingData = (data.meta as any)?.extractedData;
      if (existingData) {
        const initialData = JSON.parse(JSON.stringify(existingData));

        // Compatibilidad: convertir estructura antigua a nueva
        if (existingData.montador && !existingData.montadores) {
          initialData.montadores = [{
            nombreCompleto: `${existingData.montador.nombre || ''} ${existingData.montador.apellidos || ''}`.trim(),
            horas: existingData.horas?.ordinarias || 0
          }];
          if (!initialData.horasTotales) {
            initialData.horasTotales = existingData.horas || {
              ordinarias: 0,
              extras: 0,
              festivas: 0
            };
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
          horario: null,
          fecha: null,
          montadores: [],
          horasTotales: {
            ordinarias: 0,
            extras: 0,
            festivas: 0
          },
          desgloseDetallado: null,
          firmas: {
            inspector: false,
            montador: false,
            cliente: false
          }
        });
      }

      // Cargar imagen
      const {
        data: signedUrlData
      } = await supabase.storage.from('scans').createSignedUrl(data.storage_path, 3600);
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
      const {
        data,
        error
      } = await supabase.functions.invoke('validate-document', {
        body: {
          imageData: imageUrl
        }
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
      const {
        error
      } = await supabase.from('documents').update({
        meta: {
          ...document.meta,
          extractedData: editedData
        } as any
      }).eq('id', document.id);
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
  const handleToggleValidation = async (checked: boolean) => {
    if (!document) {
      toast.error('No hay documento cargado');
      return;
    }
    try {
      const {
        error
      } = await supabase.from('documents').update({
        meta: {
          ...document.meta,
          manuallyValidated: checked
        } as any,
        status: checked ? 'approved' : 'pending',
        validated_at: checked ? new Date().toISOString() : null
      }).eq('id', document.id);
      if (error) {
        console.error('Error updating validation status:', error);
        toast.error('Error al actualizar el estado de validación');
        return;
      }
      setIsManuallyValidated(checked);
      setDocument({
        ...document,
        meta: {
          ...document.meta,
          manuallyValidated: checked
        },
        status: checked ? 'approved' : 'pending',
        validated_at: checked ? new Date().toISOString() : null
      });
      toast.success(checked ? '✓ Parte validado y bloqueado correctamente' : 'Parte desbloqueado y editable');
    } catch (error) {
      console.error('Unexpected error toggling validation:', error);
      toast.error('Error inesperado al cambiar el estado de validación');
    }
  };
  const handleExportToDrive = async () => {
    if (!document) {
      toast.error('No hay documento cargado');
      return;
    }

    // Validación: solo exportar si está validado
    if (!isManuallyValidated) {
      toast.error('Debes validar el parte antes de exportarlo a Drive');
      return;
    }
    setIsExporting(true);
    try {
      // Construir nombre de archivo legible
      const parteNumero = editedData?.parteNumero || document.id;
      const fecha = editedData?.fecha ? new Date(editedData.fecha).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      const nombreArchivo = `Parte_${parteNumero}_${fecha}.jpg`;

      // Llamar a la edge function
      const {
        data,
        error
      } = await supabase.functions.invoke('upload_parte_to_drive', {
        body: {
          obra_id: editedData?.obra || 'sin-obra',
          parte_id: document.id,
          storage_path: document.storage_path,
          nombre_archivo: nombreArchivo,
          target_drive_folder_id: null // Usa carpeta por defecto
        }
      });
      if (error) {
        console.error('Error calling upload function:', error);
        toast.error('Error al conectar con el servicio de exportación');
        return;
      }
      if (data.status === 'error') {
        toast.error(`Error: ${data.message}`);
        return;
      }

      // Éxito
      toast.success(<div className="flex flex-col gap-1">
          <span>✓ Parte exportado correctamente a Google Drive</span>
          <a href={data.drive_url} target="_blank" rel="noopener noreferrer" className="text-primary underline text-sm">
            Abrir en Drive →
          </a>
        </div>, {
        duration: 8000
      });
    } catch (error) {
      console.error('Unexpected error exporting to Drive:', error);
      toast.error('Error inesperado al exportar a Drive');
    } finally {
      setIsExporting(false);
    }
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
  const saveRotation = async (newRotation: number) => {
    if (!document) return;
    
    try {
      const updatedMeta = {
        ...document.meta,
        rotation: newRotation
      };
      
      const { error } = await supabase
        .from('documents')
        .update({ meta: updatedMeta as any })
        .eq('id', document.id);
      
      if (error) {
        console.error('Error saving rotation:', error);
        return;
      }
      
      // Actualizar estado local del documento
      setDocument(prev => prev ? { ...prev, meta: updatedMeta } : null);
    } catch (error) {
      console.error('Error saving rotation:', error);
    }
  };

  const handleRotateLeft = () => {
    const newRotation = (rotation - 90 + 360) % 360;
    setRotation(newRotation);
    saveRotation(newRotation);
  };
  const handleRotateRight = () => {
    const newRotation = (rotation + 90) % 360;
    setRotation(newRotation);
    saveRotation(newRotation);
  };
  const handleResetRotation = () => {
    setRotation(0);
    saveRotation(0);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
  };

  // Detectar si la rotación es lateral (90° o 270°)
  const isLateralRotation = Math.abs(rotation % 180) === 90;
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
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b bg-card flex-shrink-0 shadow-sm">
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
              {!isEditMode && !isManuallyValidated ? <Button size="sm" variant="outline" onClick={() => setIsEditMode(true)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Editar
                </Button> : isManuallyValidated ? <Badge variant="secondary" className="text-xs">
                  <Lock className="mr-1 h-3 w-3" />
                  Parte bloqueado
                </Badge> : <>
                  <Button size="sm" variant="outline" onClick={handleCancelEdit} disabled={isSavingChanges}>
                    <XCircle className="mr-2 h-4 w-4" />
                    Cancelar
                  </Button>
                  <Button size="sm" variant="default" onClick={handleSaveEditedData} disabled={isSavingChanges}>
                    {isSavingChanges ? <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Guardando...
                      </> : <>
                        <Save className="mr-2 h-4 w-4" />
                        Guardar
                      </>}
                  </Button>
                </>}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 flex-1 min-h-0 overflow-hidden">
        <div className="grid grid-cols-5 gap-6 h-full">
          {/* Left Column: Image (2/5) - CON SCROLL Y ZOOM FUNCIONAL */}
          <div className="col-span-2 h-full min-h-0 flex flex-col border rounded-lg bg-card">
            {/* Header fijo con controles de zoom */}
            <div className="flex-shrink-0 p-3 border-b bg-muted/50 flex items-center justify-between">
              <span className="text-sm font-medium">Vista Previa</span>
              <div className="flex items-center gap-2">
                {/* Botón Zoom Out */}
                <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 50} className="h-8 w-8 p-0">
                  <ZoomOut className="h-4 w-4" />
                </Button>
                
                {/* Indicador de zoom clickeable para reset */}
                <Button variant="ghost" size="sm" onClick={handleResetZoom} className="h-8 px-2 text-xs font-mono">
                  {zoom}%
                </Button>
                
                {/* Botón Zoom In */}
                <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 200} className="h-8 w-8 p-0">
                  <ZoomIn className="h-4 w-4" />
                </Button>
                
                {/* Separador entre zoom y rotación */}
                <div className="h-6 w-px bg-border mx-1" />
                
                {/* Botón Rotar Izquierda */}
                <Button variant="outline" size="sm" onClick={handleRotateLeft} className="h-8 w-8 p-0" title="Girar 90° izquierda">
                  <RotateCcw className="h-4 w-4" />
                </Button>
                
                {/* Indicador de rotación clickeable para reset */}
                <Button variant="ghost" size="sm" onClick={handleResetRotation} className="h-8 px-2 text-xs font-mono" title="Restablecer orientación">
                  {rotation}°
                </Button>
                
                {/* Botón Rotar Derecha */}
                <Button variant="outline" size="sm" onClick={handleRotateRight} className="h-8 w-8 p-0" title="Girar 90° derecha">
                  <RotateCw className="h-4 w-4" />
                </Button>
                
                {/* Separador entre rotación y exportar */}
                <div className="h-6 w-px bg-border mx-1" />
                
                {/* Botón Exportar a Drive */}
                <Button variant={isManuallyValidated ? "default" : "outline"} size="sm" onClick={handleExportToDrive} disabled={isExporting || !isManuallyValidated} className="h-8 px-3 flex items-center gap-2" title={!isManuallyValidated ? "Debes validar el parte antes de exportarlo" : "Exportar a Google Drive"}>
                  {isExporting ? <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-xs">Exportando...</span>
                    </> : <>
                      <Cloud className="h-4 w-4" />
                      <span className="text-xs">Exportar a Drive</span>
                    </>}
                </Button>
              </div>
            </div>
            
            {/* Contenedor scrolleable con imagen zoomeable */}
            <div className="flex-1 min-h-0 bg-muted/20 relative overflow-auto">
              <div 
                className="p-4"
                style={{ 
                  width: `${zoom}%`,
                  minWidth: zoom < 100 ? '100%' : undefined,
                  boxSizing: 'border-box'
                }}
              >
                <div 
                  className="flex justify-center items-center"
                  style={{
                    minHeight: '100%'
                  }}
                >
                  {imageUrl && (
                    <img 
                      src={imageUrl} 
                      alt="Documento escaneado" 
                      className="shadow-lg transition-all duration-200"
                      onLoad={handleImageLoad}
                      style={{
                        width: isLateralRotation ? 'auto' : '100%',
                        height: isLateralRotation ? '100%' : 'auto',
                        maxWidth: '100%',
                        maxHeight: '100%',
                        objectFit: 'contain',
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: 'center center'
                      }} 
                    />
                  )}
                </div>
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
            
          </div>
          
          {/* Right Column: Unified Single Card */}
          <div className="col-span-3 h-full min-h-0 flex flex-col">
            <Card className="h-full min-h-0 flex flex-col relative">
              {/* Cartela diagonal VALIDADO */}
              {isManuallyValidated && <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                  <div className="bg-white/85 text-[#D32F2F] font-bold text-4xl px-16 py-6 rounded-xl border-4 border-[#D32F2F] shadow-lg" style={{
                transform: 'rotate(-30deg)',
                letterSpacing: '0.25em'
              }}>
                    VALIDADO
                  </div>
                </div>}
              {/* Header Fijo */}
              <div className="border-b p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Datos Extraídos del Parte</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Revisa y corrige los datos extraídos del parte de trabajo
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                  const dataStr = JSON.stringify(editedData, null, 2);
                  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
                  const exportFileDefaultName = `parte_${editedData?.parteNumero || document.id}.json`;
                  const linkElement = window.document.createElement('a');
                  linkElement.setAttribute('href', dataUri);
                  linkElement.setAttribute('download', exportFileDefaultName);
                  linkElement.click();
                  toast.success('Datos exportados correctamente');
                }}>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar Individual
                  </Button>
                </div>
              </div>

              {/* Contenido Scrolleable */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-6">
                  
                  {/* === SECCIÓN 1: DATOS DEL PARTE === */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Datos del Parte
                    </h3>
                    <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                      {/* Nº de Parte */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">Nº de Parte</label>
                        {isEditMode ? <Input value={editedData?.parteNumero || ''} onChange={e => setEditedData({
                        ...editedData!,
                        parteNumero: e.target.value
                      })} /> : <p className="text-sm font-medium">
                            {editedData?.parteNumero || 'N/A'}
                          </p>}
                      </div>

                      {/* Fecha */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">Fecha del Parte</label>
                        {isEditMode ? <Input type="date" value={editedData?.fecha ? new Date(editedData.fecha).toISOString().split('T')[0] : ''} onChange={e => setEditedData({
                        ...editedData!,
                        fecha: e.target.value
                      })} /> : <p className="text-sm font-medium">
                            {editedData?.fecha ? new Date(editedData.fecha).toLocaleDateString('es-ES', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }) : 'N/A'}
                          </p>}
                      </div>

                      {/* Cliente */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">Cliente</label>
                        {isEditMode ? <Input value={editedData?.cliente || ''} onChange={e => setEditedData({
                        ...editedData!,
                        cliente: e.target.value
                      })} /> : <p className="text-sm font-medium">
                            {editedData?.cliente || 'N/A'}
                          </p>}
                      </div>

                      {/* Emplazamiento */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-1.5 block">Emplazamiento</label>
                        {isEditMode ? <Input value={editedData?.emplazamiento || ''} onChange={e => setEditedData({
                        ...editedData!,
                        emplazamiento: e.target.value
                      })} /> : <p className="text-sm font-medium">
                            {editedData?.emplazamiento || 'N/A'}
                          </p>}
                      </div>

          {/* Obra */}
          <div>
            <label className="text-sm text-muted-foreground mb-1.5 block">Obra</label>
                        {isEditMode ? <Input value={editedData?.obra || ''} onChange={e => setEditedData({
                        ...editedData!,
                        obra: e.target.value
                      })} /> : <p className="text-sm font-medium">
                            {editedData?.obra || 'N/A'}
                          </p>}
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* === SECCIÓN 2: TRABAJO REALIZADO === */}
                  <div className="mb-6">
                    <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
                      <Briefcase className="h-5 w-5 text-primary" />
                      Trabajo Realizado
                    </h3>
                    
                    <div className="space-y-4">
                      {/* Fila con Descripción y Horario lado a lado */}
                      <div className="grid grid-cols-3 gap-4">
                        {/* Descripción del Trabajo Realizado - 2/3 del ancho */}
                        <div className="col-span-2">
                          <label className="text-sm text-muted-foreground mb-1.5 block">
                            Descripción del Trabajo Realizado
                          </label>
                          {isEditMode ? <Textarea value={editedData?.trabajoRealizado || ''} onChange={e => setEditedData({
                          ...editedData!,
                          trabajoRealizado: e.target.value
                        })} className="min-h-[100px]" /> : <p className="text-sm whitespace-pre-wrap bg-muted/20 p-3 rounded-md">
                              {editedData?.trabajoRealizado || 'N/A'}
                            </p>}
                        </div>

                        {/* Horario - 1/3 del ancho */}
                        <div>
                          <label className="text-sm text-muted-foreground mb-1.5 block">
                            Horario
                          </label>
                          {isEditMode ? <Input value={editedData?.horario || ''} onChange={e => setEditedData({
                          ...editedData!,
                          horario: e.target.value
                        })} /> : <p className="text-sm font-medium">
                              {editedData?.horario || 'N/A'}
                            </p>}
                        </div>
                      </div>

                      {/* Estado de Firmas */}
                      <div>
                        <label className="text-sm text-muted-foreground mb-2 block">Estado de Firmas</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                          <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-md min-h-[100px] gap-2">
                            <span className="text-sm font-medium text-center">Firma del Inspector</span>
                            {isEditMode ? <Select value={editedData?.firmas?.inspector ? "true" : "false"} onValueChange={value => {
                            setEditedData(prev => prev ? {
                              ...prev,
                              firmas: {
                                ...prev.firmas,
                                inspector: value === "true"
                              }
                            } : prev);
                          }}>
                                <SelectTrigger className="w-[160px] h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  <SelectItem value="true">✓ Firmado</SelectItem>
                                  <SelectItem value="false">✗ No firmado</SelectItem>
                                </SelectContent>
                              </Select> : <Badge variant={editedData?.firmas?.inspector ? "default" : "secondary"} className="w-auto">
                                {editedData?.firmas?.inspector ? '✓ Firmado' : '✗ No firmado'}
                              </Badge>}
                          </div>
                          <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-md min-h-[100px] gap-2">
                            <span className="text-sm font-medium text-center">Firma del Montador</span>
                            {isEditMode ? <Select value={editedData?.firmas?.montador ? "true" : "false"} onValueChange={value => {
                            setEditedData(prev => prev ? {
                              ...prev,
                              firmas: {
                                ...prev.firmas,
                                montador: value === "true"
                              }
                            } : prev);
                          }}>
                                <SelectTrigger className="w-[160px] h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  <SelectItem value="true">✓ Firmado</SelectItem>
                                  <SelectItem value="false">✗ No firmado</SelectItem>
                                </SelectContent>
                              </Select> : <Badge variant={editedData?.firmas?.montador ? "default" : "secondary"} className="w-auto">
                                {editedData?.firmas?.montador ? '✓ Firmado' : '✗ No firmado'}
                              </Badge>}
                          </div>
                          <div className="flex flex-col items-center justify-center p-4 bg-muted/20 rounded-md min-h-[100px] gap-2">
                            <span className="text-sm font-medium text-center">Firma del Cliente</span>
                            {isEditMode ? <Select value={editedData?.firmas?.cliente ? "true" : "false"} onValueChange={value => {
                            setEditedData(prev => prev ? {
                              ...prev,
                              firmas: {
                                ...prev.firmas,
                                cliente: value === "true"
                              }
                            } : prev);
                          }}>
                                <SelectTrigger className="w-[160px] h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-background">
                                  <SelectItem value="true">✓ Firmado</SelectItem>
                                  <SelectItem value="false">✗ No firmado</SelectItem>
                                </SelectContent>
                              </Select> : <Badge variant={editedData?.firmas?.cliente ? "default" : "secondary"} className="w-auto">
                                {editedData?.firmas?.cliente ? '✓ Firmado' : '✗ No firmado'}
                              </Badge>}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* === SECCIÓN 3: MONTADORES === */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-base flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        Montadores
                      </h3>
                      <Button size="sm" variant="outline" onClick={reExtractMontadores} disabled={isReextracting}>
                        {isReextracting ? <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Reextrayendo...
                          </> : <>
                            <FileText className="h-4 w-4 mr-2" />
                            Reextraer desde imagen
                          </>}
                      </Button>
                    </div>

                    {/* Listado de Montadores */}
                    {editedData?.montadores && editedData.montadores.length > 0 ? <div className="space-y-3 mb-6">
                        {editedData.montadores.map((montador, index) => <div key={index} className="border rounded-lg p-4 bg-muted/20">
                            <div className="flex items-center justify-between gap-6">
                              {/* Nombre del montador */}
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                <User className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <label className="text-xs text-muted-foreground mb-0.5 block">
                                    Montador {editedData.montadores!.length > 1 ? `#${index + 1}` : ''}
                                  </label>
                                  {isEditMode ? <Input value={montador.nombreCompleto || ''} onChange={e => {
                              const newMontadores = [...editedData.montadores!];
                              newMontadores[index] = {
                                ...newMontadores[index],
                                nombreCompleto: e.target.value
                              };
                              setEditedData({
                                ...editedData,
                                montadores: newMontadores
                              });
                            }} className="h-8" /> : <p className="text-sm font-medium truncate">
                                      {montador.nombreCompleto || 'N/A'}
                                    </p>}
                                </div>
                              </div>

                              {/* Desglose de horas */}
                              <div className="flex items-center gap-4 flex-shrink-0">
                                {/* Horas Activas */}
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground mb-1 font-medium">H. Activas</div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-center">
                                      <span className="text-[10px] text-muted-foreground uppercase">N</span>
                                      {isEditMode ? <Input type="number" value={montador.horasActivas?.normales ?? 0} onChange={e => {
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
                                }} className="w-14 h-8 text-center text-sm" min="0" step="0.5" /> : <span className="text-sm font-semibold text-blue-600">
                                          {montador.horasActivas?.normales ?? 0}
                                        </span>}
                                    </div>
                                    <span className="text-muted-foreground">/</span>
                                    <div className="flex flex-col items-center">
                                      <span className="text-[10px] text-muted-foreground uppercase">Ex</span>
                                      {isEditMode ? <Input type="number" value={montador.horasActivas?.extras ?? 0} onChange={e => {
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
                                }} className="w-14 h-8 text-center text-sm" min="0" step="0.5" /> : <span className="text-sm font-semibold text-orange-600">
                                          {montador.horasActivas?.extras ?? 0}
                                        </span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="h-12 w-px bg-border" />

                                {/* Horas de Viaje */}
                                <div className="text-center">
                                  <div className="text-xs text-muted-foreground mb-1 font-medium">H. Viaje</div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col items-center">
                                      <span className="text-[10px] text-muted-foreground uppercase">N</span>
                                      {isEditMode ? <Input type="number" value={montador.horasViaje?.normales ?? 0} onChange={e => {
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
                                }} className="w-14 h-8 text-center text-sm" min="0" step="0.5" /> : <span className="text-sm font-semibold text-blue-600">
                                          {montador.horasViaje?.normales ?? 0}
                                        </span>}
                                    </div>
                                    <span className="text-muted-foreground">/</span>
                                    <div className="flex flex-col items-center">
                                      <span className="text-[10px] text-muted-foreground uppercase">Ex</span>
                                      {isEditMode ? <Input type="number" value={montador.horasViaje?.extras ?? 0} onChange={e => {
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
                                }} className="w-14 h-8 text-center text-sm" min="0" step="0.5" /> : <span className="text-sm font-semibold text-orange-600">
                                          {montador.horasViaje?.extras ?? 0}
                                        </span>}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>)}
                      </div> : <p className="text-sm text-muted-foreground text-center py-4 mb-6">
                        No hay montadores registrados
                      </p>}

                    {/* Horas Totales Trabajadas */}
                    <div className="border-t pt-6">
                      <h4 className="font-semibold text-sm mb-4 flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Horas Totales Trabajadas
                      </h4>
                      {editedData?.montadores && editedData.montadores.length > 0 ? <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Horas Activas (N)</span>
                            <span className="font-semibold text-blue-600">
                              {editedData.montadores.reduce((sum, m) => sum + (m.horasActivas?.normales ?? 0), 0)}h
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Horas Activas (Ex)</span>
                            <span className="font-semibold text-orange-600">
                              {editedData.montadores.reduce((sum, m) => sum + (m.horasActivas?.extras ?? 0), 0)}h
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Horas de Viaje (N)</span>
                            <span className="font-semibold text-blue-600">
                              {editedData.montadores.reduce((sum, m) => sum + (m.horasViaje?.normales ?? 0), 0)}h
                            </span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">Horas de Viaje (Ex)</span>
                            <span className="font-semibold text-orange-600">
                              {editedData.montadores.reduce((sum, m) => sum + (m.horasViaje?.extras ?? 0), 0)}h
                            </span>
                          </div>
                          <div className="col-span-2 border-t pt-3 mt-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm font-semibold">Total General</span>
                              <span className="text-lg font-bold text-primary">
                                {editedData.montadores.reduce((sum, m) => sum + (m.horasActivas?.normales ?? 0) + (m.horasActivas?.extras ?? 0) + (m.horasViaje?.normales ?? 0) + (m.horasViaje?.extras ?? 0), 0)}h
                              </span>
                            </div>
                          </div>
                        </div> : <p className="text-sm text-muted-foreground">No hay datos de montadores disponibles</p>}
                    </div>
                  </div>

                  <Separator className="my-6" />

                  {/* === SECCIÓN 4: METADATOS DE VALIDACIÓN === */}
                  <div>
                    <h3 className="font-semibold text-base mb-4 flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Metadatos de Validación
                    </h3>
                    <dl className="grid grid-cols-3 gap-x-6 gap-y-4">
                      <div>
                        <dt className="text-sm text-muted-foreground mb-1">Legibilidad</dt>
                        <dd className="text-sm font-medium">
                          {document.meta?.legibilityScore ? `${document.meta.legibilityScore}%` : 'N/A'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground mb-1">Subido por</dt>
                        <dd className="text-sm font-medium">
                          {document.profiles?.full_name || 'Usuario desconocido'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm text-muted-foreground mb-1">Fecha de subida</dt>
                        <dd className="text-sm font-medium">
                          {new Date(document.created_at).toLocaleString('es-ES')}
                        </dd>
                      </div>
                      {document.validated_at && <div>
                          <dt className="text-sm text-muted-foreground mb-1">Fecha de validación</dt>
                          <dd className="text-sm font-medium">
                            {new Date(document.validated_at).toLocaleString('es-ES')}
                          </dd>
                        </div>}
                    </dl>

                    {/* Notas de Revisión */}
                    {document.review_notes && <div className="mt-6 pt-6 border-t">
                        <h4 className="font-semibold text-sm mb-2">Notas de Revisión</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/20 p-3 rounded-md">
                          {document.review_notes}
                        </p>
                      </div>}
                  </div>

                  <Separator className="my-6" />

                  {/* CONTROLES DE VALIDACIÓN Y GUARDADO */}
                  <div className="flex items-center justify-between gap-4">
                    {/* Toggle de Validación Completada */}
                    <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-500 rounded-lg flex-1">
                      <Lock className="h-5 w-5 text-green-600" />
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-green-900">
                            Validación Completada
                          </span>
                          <Switch checked={isManuallyValidated} onCheckedChange={handleToggleValidation} disabled={isEditMode} />
                        </div>
                        <p className="text-xs text-green-700 mt-0.5">
                          {isManuallyValidated ? 'El parte está bloqueado' : 'El parte está editable'}
                        </p>
                      </div>
                    </div>
                  </div>

                </div>
              </ScrollArea>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
};
export default DocumentDetails;