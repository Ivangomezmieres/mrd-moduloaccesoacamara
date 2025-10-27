-- Parte 2: Crear políticas RLS y asignar rol superadmin

-- 1. Crear políticas RLS para superadmin en la tabla documents
CREATE POLICY "superadmin_all_documents"
ON public.documents
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- 2. Crear políticas RLS para superadmin en la tabla user_roles
CREATE POLICY "superadmin_manage_roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- 3. Crear política para que superadmin pueda gestionar perfiles
CREATE POLICY "superadmin_update_profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

-- 4. Crear política para lectura completa de perfiles
CREATE POLICY "superadmin_select_all_profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role));

-- 5. ASIGNAR ROL SUPERADMIN AL USUARIO IVAN
INSERT INTO public.user_roles (user_id, role)
VALUES ('0a88b308-a35f-48d6-946c-6bbd0ad29f7b', 'superadmin')
ON CONFLICT (user_id, role) DO NOTHING;