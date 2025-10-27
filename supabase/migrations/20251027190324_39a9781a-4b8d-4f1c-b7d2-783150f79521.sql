-- ============================================
-- CREATE FUNCTIONS
-- ============================================

CREATE OR REPLACE FUNCTION public.prevent_uploader_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.uploader IS NOT NULL AND NEW.uploader != OLD.uploader THEN
    RAISE EXCEPTION 'Cannot change document uploader after creation';
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================
-- DROP EXISTING TRIGGER IF EXISTS
-- ============================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ============================================
-- CREATE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path TEXT NOT NULL,
  uploader UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  meta JSONB,
  review_notes TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- CREATE TRIGGERS
-- ============================================

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS protect_uploader_field ON public.documents;
CREATE TRIGGER protect_uploader_field
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.prevent_uploader_change();

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES FOR documents
-- ============================================

DROP POLICY IF EXISTS "scanner_select_own_documents" ON public.documents;
CREATE POLICY "scanner_select_own_documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'scanner') AND uploader = auth.uid());

DROP POLICY IF EXISTS "scanner_insert_documents" ON public.documents;
CREATE POLICY "scanner_insert_documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'scanner') AND uploader = auth.uid());

DROP POLICY IF EXISTS "scanner_update_own_pending" ON public.documents;
CREATE POLICY "scanner_update_own_pending" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'scanner') 
    AND uploader = auth.uid()
    AND status = 'pending'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'scanner') 
    AND uploader = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND review_notes IS NULL
  );

DROP POLICY IF EXISTS "revisor_select_all_documents" ON public.documents;
CREATE POLICY "revisor_select_all_documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'revisor'));

DROP POLICY IF EXISTS "revisor_update_documents" ON public.documents;
CREATE POLICY "revisor_update_documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'revisor'))
  WITH CHECK (public.has_role(auth.uid(), 'revisor'));

DROP POLICY IF EXISTS "admin_select_documents" ON public.documents;
CREATE POLICY "admin_select_documents" ON public.documents
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_insert_documents" ON public.documents;
CREATE POLICY "admin_insert_documents" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_update_documents" ON public.documents;
CREATE POLICY "admin_update_documents" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_delete_documents" ON public.documents;
CREATE POLICY "admin_delete_documents" ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- RLS POLICIES FOR profiles
-- ============================================

DROP POLICY IF EXISTS "authenticated_select_profiles" ON public.profiles;
CREATE POLICY "authenticated_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "users_update_own_profile" ON public.profiles;
CREATE POLICY "users_update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "admin_update_profiles" ON public.profiles;
CREATE POLICY "admin_update_profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- RLS POLICIES FOR user_roles
-- ============================================

DROP POLICY IF EXISTS "users_select_own_roles" ON public.user_roles;
CREATE POLICY "users_select_own_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin_select_roles" ON public.user_roles;
CREATE POLICY "admin_select_roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_insert_roles" ON public.user_roles;
CREATE POLICY "admin_insert_roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_update_roles" ON public.user_roles;
CREATE POLICY "admin_update_roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_delete_roles" ON public.user_roles;
CREATE POLICY "admin_delete_roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ============================================
-- STORAGE POLICIES FOR scans BUCKET
-- ============================================

DROP POLICY IF EXISTS "scanner_insert_own_scans" ON storage.objects;
CREATE POLICY "scanner_insert_own_scans" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'scanner')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "scanner_select_own_scans" ON storage.objects;
CREATE POLICY "scanner_select_own_scans" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'scanner')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "revisor_select_all_scans" ON storage.objects;
CREATE POLICY "revisor_select_all_scans" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'revisor')
  );

DROP POLICY IF EXISTS "admin_select_scans" ON storage.objects;
CREATE POLICY "admin_select_scans" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "admin_insert_scans" ON storage.objects;
CREATE POLICY "admin_insert_scans" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "admin_update_scans" ON storage.objects;
CREATE POLICY "admin_update_scans" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "admin_delete_scans" ON storage.objects;
CREATE POLICY "admin_delete_scans" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'scans'
    AND public.has_role(auth.uid(), 'admin')
  );

-- ============================================
-- PERFORMANCE INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_documents_uploader ON public.documents(uploader);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_status_created ON public.documents(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);