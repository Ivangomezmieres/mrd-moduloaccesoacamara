-- Add RLS policy for superadmin to access scans bucket
CREATE POLICY superadmin_select_scans
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'scans'
  AND has_role(auth.uid(), 'superadmin'::app_role)
);