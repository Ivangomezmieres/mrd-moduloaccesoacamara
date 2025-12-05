-- Add unique constraint on document_id in obras table
-- This is required for the ON CONFLICT clause in sync_orden_trabajo_to_obras trigger
ALTER TABLE public.obras 
ADD CONSTRAINT obras_document_id_unique UNIQUE (document_id);