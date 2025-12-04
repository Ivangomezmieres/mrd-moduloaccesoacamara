-- 1. Añadir columna document_id a tabla obras
ALTER TABLE public.obras
ADD COLUMN document_id uuid REFERENCES public.documents(id) ON DELETE CASCADE;

-- 2. Crear índice único para document_id (permite null, pero si tiene valor debe ser único)
CREATE UNIQUE INDEX obras_document_id_idx ON public.obras(document_id) WHERE document_id IS NOT NULL;

-- 3. Eliminar constraint único de orden_trabajo (para permitir actualizaciones)
ALTER TABLE public.obras DROP CONSTRAINT IF EXISTS obras_orden_trabajo_key;

-- 4. Modificar el trigger para usar document_id como clave de sincronización
CREATE OR REPLACE FUNCTION public.sync_orden_trabajo_to_obras()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_orden_trabajo TEXT;
  v_cliente TEXT;
  v_obra TEXT;
BEGIN
  -- Extraer campos del meta.extractedData
  v_orden_trabajo := NEW.meta->'extractedData'->>'ordenTrabajo';
  v_cliente := NEW.meta->'extractedData'->>'cliente';
  v_obra := NEW.meta->'extractedData'->>'obra';
  
  -- Si hay un ordenTrabajo válido
  IF v_orden_trabajo IS NOT NULL AND v_orden_trabajo != '' THEN
    -- Insertar o actualizar usando document_id como clave
    INSERT INTO public.obras (document_id, orden_trabajo, cliente, obra)
    VALUES (NEW.id, v_orden_trabajo, v_cliente, v_obra)
    ON CONFLICT (document_id) 
    DO UPDATE SET 
      orden_trabajo = EXCLUDED.orden_trabajo,
      cliente = EXCLUDED.cliente,
      obra = EXCLUDED.obra,
      updated_at = now();
  ELSE
    -- Si no hay O.T., eliminar la fila existente si la hubiera
    DELETE FROM public.obras WHERE document_id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 5. Migrar datos existentes: vincular obras con documentos basándose en orden_trabajo
UPDATE public.obras o
SET document_id = (
  SELECT d.id 
  FROM public.documents d 
  WHERE d.meta->'extractedData'->>'ordenTrabajo' = o.orden_trabajo
  LIMIT 1
)
WHERE o.document_id IS NULL;

-- 6. Eliminar filas huérfanas (obras sin documento vinculado después de migración)
DELETE FROM public.obras WHERE document_id IS NULL;