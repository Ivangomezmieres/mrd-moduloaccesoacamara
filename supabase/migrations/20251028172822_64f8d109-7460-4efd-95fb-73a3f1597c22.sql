-- Crear política para que superadmins puedan eliminar archivos del bucket scans
CREATE POLICY superadmin_delete_scans
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'scans'
  AND has_role(auth.uid(), 'superadmin'::app_role)
);