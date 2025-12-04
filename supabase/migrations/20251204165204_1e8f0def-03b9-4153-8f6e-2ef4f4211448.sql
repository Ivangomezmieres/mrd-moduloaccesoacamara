-- Crear tabla obras para gestión de O.T.
CREATE TABLE public.obras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_trabajo TEXT NOT NULL UNIQUE,
  cliente TEXT,
  obra TEXT,
  carpeta_drive TEXT,
  validado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger para actualizar updated_at
CREATE TRIGGER update_obras_updated_at
  BEFORE UPDATE ON public.obras
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.obras ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "superadmin_all_obras" ON public.obras
  FOR ALL USING (public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "admin_all_obras" ON public.obras
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Función para sincronizar O.T. desde documents a obras
CREATE OR REPLACE FUNCTION public.sync_orden_trabajo_to_obras()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orden_trabajo TEXT;
  v_cliente TEXT;
  v_obra TEXT;
BEGIN
  -- Extraer orden_trabajo del meta.extractedData
  v_orden_trabajo := NEW.meta->'extractedData'->>'ordenTrabajo';
  
  -- Si hay un ordenTrabajo válido
  IF v_orden_trabajo IS NOT NULL AND v_orden_trabajo != '' THEN
    -- Extraer cliente y obra
    v_cliente := NEW.meta->'extractedData'->>'cliente';
    v_obra := NEW.meta->'extractedData'->>'obra';
    
    -- Insertar solo si no existe
    INSERT INTO public.obras (orden_trabajo, cliente, obra)
    VALUES (v_orden_trabajo, v_cliente, v_obra)
    ON CONFLICT (orden_trabajo) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger en documents para sincronización automática
CREATE TRIGGER sync_ot_to_obras_trigger
  AFTER INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_orden_trabajo_to_obras();