import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import logoMrd from "@/assets/logo-mrd.jpg";

interface Obra {
  id: string;
  orden_trabajo: string;
  cliente: string | null;
  obra: string | null;
  carpeta_drive: string | null;
  validado: boolean;
  created_at: string;
  updated_at: string;
}

const ObraManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState<Obra[]>([]);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    checkAuthAndLoadData();
  }, []);

  const checkAuthAndLoadData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    const userRoles = roles?.map(r => r.role) || [];
    if (!userRoles.includes("superadmin") && !userRoles.includes("admin")) {
      navigate("/");
      return;
    }

    await loadObras();
  };

  const loadObras = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("obras")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        title: "Error",
        description: "No se pudieron cargar las obras",
        variant: "destructive",
      });
    } else {
      setObras(data || []);
    }
    setLoading(false);
  };

  const startEditing = (id: string, field: string, currentValue: string | null) => {
    setEditingCell({ id, field });
    setEditValue(currentValue || "");
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditValue("");
  };

  const saveField = async (id: string, field: string) => {
    setSavingId(id);
    const { error } = await supabase
      .from("obras")
      .update({ [field]: editValue })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo guardar el cambio",
        variant: "destructive",
      });
    } else {
      setObras(obras.map(o => 
        o.id === id ? { ...o, [field]: editValue } : o
      ));
      toast({
        title: "Guardado",
        description: "Campo actualizado correctamente",
      });
    }
    setEditingCell(null);
    setEditValue("");
    setSavingId(null);
  };

  const toggleValidado = async (id: string, currentValue: boolean) => {
    setSavingId(id);
    const newValue = !currentValue;
    const { error } = await supabase
      .from("obras")
      .update({ validado: newValue })
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "No se pudo cambiar el estado de validación",
        variant: "destructive",
      });
    } else {
      setObras(obras.map(o => 
        o.id === id ? { ...o, validado: newValue } : o
      ));
    }
    setSavingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string, field: string) => {
    if (e.key === "Enter") {
      saveField(id, field);
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  const renderEditableCell = (obra: Obra, field: keyof Obra) => {
    const isEditing = editingCell?.id === obra.id && editingCell?.field === field;
    const value = obra[field] as string | null;

    if (isEditing) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveField(obra.id, field)}
          onKeyDown={(e) => handleKeyDown(e, obra.id, field)}
          autoFocus
          className="h-8 text-sm"
        />
      );
    }

    return (
      <div
        onClick={() => startEditing(obra.id, field, value)}
        className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded min-h-[32px] flex items-center"
      >
        {value || <span className="text-muted-foreground italic">Click para editar</span>}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b p-4">
        <div className="container mx-auto flex items-center gap-4">
          <img 
            src={logoMrd} 
            alt="MRD Logo" 
            className="h-12 object-contain"
          />
          <h1 className="text-xl font-bold">Creación de Obra</h1>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto p-6">
        {/* Navigation */}
        <div className="mb-6">
          <Button
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => navigate("/admin/dashboard")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al Panel de Control
          </Button>
        </div>

        {/* Table */}
        <div className="bg-card rounded-lg border shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">O.T.</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Carpeta Drive</TableHead>
                <TableHead className="w-[150px] text-center">Validado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {obras.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No hay obras registradas. Las O.T. se añadirán automáticamente al procesar partes.
                  </TableCell>
                </TableRow>
              ) : (
                obras.map((obra) => (
                  <TableRow 
                    key={obra.id}
                    className={obra.validado ? "bg-primary/10" : ""}
                  >
                    <TableCell className="font-medium">
                      {renderEditableCell(obra, "orden_trabajo")}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(obra, "cliente")}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(obra, "obra")}
                    </TableCell>
                    <TableCell>
                      {renderEditableCell(obra, "carpeta_drive")}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        {savingId === obra.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Switch
                              checked={obra.validado}
                              onCheckedChange={() => toggleValidado(obra.id, obra.validado)}
                            />
                            {obra.validado && (
                              <span className="flex items-center gap-1 text-primary text-sm font-medium">
                                <CheckCircle2 className="h-4 w-4" />
                                Validado
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default ObraManagement;
