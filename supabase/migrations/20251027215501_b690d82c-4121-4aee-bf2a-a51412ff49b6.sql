-- Insertar perfiles faltantes para usuarios que existen en auth.users pero no en public.profiles
INSERT INTO public.profiles (id, full_name)
SELECT 
  au.id, 
  COALESCE(au.raw_user_meta_data->>'full_name', au.email)
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- Asignar rol 'scanner' por defecto a usuarios sin roles
INSERT INTO public.user_roles (user_id, role)
SELECT 
  au.id,
  'scanner'::app_role
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE ur.user_id IS NULL;