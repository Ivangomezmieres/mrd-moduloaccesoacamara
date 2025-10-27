import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Send, X } from 'lucide-react';

interface DocumentFormProps {
  imageData: string;
  userId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

interface FormData {
  parteNumero: string;
  cliente: string;
  emplazamiento: string;
  obra: string;
  trabajoRealizado: string;
  montadorNombre: string;
  horasActivasNormal: string;
  horasActivasExtra: string;
  horasViajeNormal: string;
  horasViajeExtra: string;
  fecha: string;
}

const DocumentForm = ({ imageData, userId, onSuccess, onCancel }: DocumentFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    parteNumero: '',
    cliente: '',
    emplazamiento: '',
    obra: '',
    trabajoRealizado: '',
    montadorNombre: '',
    horasActivasNormal: '',
    horasActivasExtra: '',
    horasViajeNormal: '',
    horasViajeExtra: '',
    fecha: new Date().toISOString().split('T')[0]
  });

  const calculateTotalHours = () => {
    const actN = parseFloat(formData.horasActivasNormal) || 0;
    const actE = parseFloat(formData.horasActivasExtra) || 0;
    const viajeN = parseFloat(formData.horasViajeNormal) || 0;
    const viajeE = parseFloat(formData.horasViajeExtra) || 0;
    return actN + actE + viajeN + viajeE;
  };

  const validateForm = (): string[] => {
    const missing: string[] = [];
    
    if (!formData.parteNumero.trim()) missing.push('Nº de parte');
    if (!formData.cliente.trim()) missing.push('Cliente');
    if (!formData.emplazamiento.trim()) missing.push('Emplazamiento');
    if (!formData.obra.trim()) missing.push('Obra');
    if (!formData.trabajoRealizado.trim()) missing.push('Trabajo realizado');
    if (!formData.montadorNombre.trim()) missing.push('Nombre del montador');
    if (!formData.fecha) missing.push('Fecha');

    return missing;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    const missingFields = validateForm();
    if (missingFields.length > 0) {
      toast.error(`Faltan los siguientes campos: ${missingFields.join(', ')}`);
      return;
    }

    setIsValidating(true);

    try {
      // Call edge function for AI validation
      const { data: validation, error: validationError } = await supabase.functions.invoke(
        'validate-document',
        {
          body: {
            imageData,
            metadata: formData
          }
        }
      );

      if (validationError) throw validationError;

      if (!validation.complete) {
        toast.error(`El documento no está completo. Faltan: ${validation.missingFields.join(', ')}`);
        setIsValidating(false);
        return;
      }

      setIsValidating(false);
      setIsSubmitting(true);

      // Convert base64 to blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      // Upload image to storage
      const fileName = `${userId}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // Save document metadata
      const { error: dbError } = await supabase
        .from('documents')
        .insert({
          storage_path: fileName,
          uploader: userId,
          status: 'pending',
          meta: {
            ...formData,
            totalHoras: calculateTotalHours(),
            validationResult: validation
          }
        });

      if (dbError) throw dbError;

      onSuccess();
    } catch (error: any) {
      console.error('Error submitting document:', error);
      toast.error(error.message || 'Error al enviar el documento');
      setIsSubmitting(false);
      setIsValidating(false);
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Datos del parte</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="parteNumero">Nº de parte *</Label>
            <Input
              id="parteNumero"
              value={formData.parteNumero}
              onChange={(e) => setFormData({ ...formData, parteNumero: e.target.value })}
              placeholder="Ej: 2024-001"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fecha">Fecha *</Label>
            <Input
              id="fecha"
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cliente">Cliente *</Label>
            <Input
              id="cliente"
              value={formData.cliente}
              onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
              placeholder="Nombre del cliente"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emplazamiento">Emplazamiento *</Label>
            <Input
              id="emplazamiento"
              value={formData.emplazamiento}
              onChange={(e) => setFormData({ ...formData, emplazamiento: e.target.value })}
              placeholder="Ubicación"
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="obra">Obra *</Label>
            <Input
              id="obra"
              value={formData.obra}
              onChange={(e) => setFormData({ ...formData, obra: e.target.value })}
              placeholder="Nombre de la obra"
              required
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="trabajoRealizado">Trabajo realizado *</Label>
            <Textarea
              id="trabajoRealizado"
              value={formData.trabajoRealizado}
              onChange={(e) => setFormData({ ...formData, trabajoRealizado: e.target.value })}
              placeholder="Descripción del trabajo..."
              rows={3}
              required
            />
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">Datos del montador</h3>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="montadorNombre">Nombre y Apellidos *</Label>
              <Input
                id="montadorNombre"
                value={formData.montadorNombre}
                onChange={(e) => setFormData({ ...formData, montadorNombre: e.target.value })}
                placeholder="Nombre completo"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="horasActivasNormal">H. Activas Normal</Label>
                <Input
                  id="horasActivasNormal"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.horasActivasNormal}
                  onChange={(e) => setFormData({ ...formData, horasActivasNormal: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="horasActivasExtra">H. Activas Extra</Label>
                <Input
                  id="horasActivasExtra"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.horasActivasExtra}
                  onChange={(e) => setFormData({ ...formData, horasActivasExtra: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="horasViajeNormal">H. Viaje Normal</Label>
                <Input
                  id="horasViajeNormal"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.horasViajeNormal}
                  onChange={(e) => setFormData({ ...formData, horasViajeNormal: e.target.value })}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="horasViajeExtra">H. Viaje Extra</Label>
                <Input
                  id="horasViajeExtra"
                  type="number"
                  step="0.5"
                  min="0"
                  value={formData.horasViajeExtra}
                  onChange={(e) => setFormData({ ...formData, horasViajeExtra: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium">
                Total de horas: <span className="text-primary">{calculateTotalHours().toFixed(1)}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="border-t pt-4 text-sm text-muted-foreground">
          <p className="mb-2">El sistema verificará automáticamente:</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>Firma del Jefe de Equipo de Montaje</li>
            <li>Firma Vº Bº del Cliente / Encargado</li>
            <li>Legibilidad del documento</li>
          </ul>
        </div>

        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting || isValidating}
            className="flex-1"
          >
            <X className="mr-2 h-4 w-4" />
            Cancelar
          </Button>

          <Button
            type="submit"
            disabled={isSubmitting || isValidating}
            className="flex-1"
          >
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validando...
              </>
            ) : isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Validar y Enviar
              </>
            )}
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default DocumentForm;
