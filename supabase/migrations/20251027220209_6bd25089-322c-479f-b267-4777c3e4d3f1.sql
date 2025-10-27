-- Agregar Foreign Key entre documents.uploader y profiles.id
ALTER TABLE public.documents
ADD CONSTRAINT fk_documents_uploader 
FOREIGN KEY (uploader) 
REFERENCES public.profiles(id) 
ON DELETE CASCADE;

-- Crear índice para mejorar performance de JOINs
CREATE INDEX IF NOT EXISTS idx_documents_uploader 
ON public.documents(uploader);