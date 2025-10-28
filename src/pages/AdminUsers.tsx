import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LogOut, UserPlus, Shield } from 'lucide-react';
import { toast } from 'sonner';

interface UserWithRoles {
  id: string;
  full_name: string;
  created_at: string;
  roles: { role: string }[];
}

const AdminUsers = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    checkAuth();
    loadUsers();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      navigate('/auth');
      return;
    }

    setCurrentUserId(session.user.id);

    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id);

    const hasAdminOrSuperAdmin = roles?.some(r => 
      r.role === 'admin' || r.role === 'superadmin'
    );
    
    if (!hasAdminOrSuperAdmin) {
      toast.error('No tienes permisos para acceder a esta página');
      navigate('/scan');
    }
  };

  const loadUsers = async () => {
    setIsLoading(true);
    
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        created_at
      `);

    if (profilesError) {
      console.error('Error loading profiles:', profilesError);
      toast.error('Error al cargar usuarios');
      setIsLoading(false);
      return;
    }

    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role');

    if (rolesError) {
      console.error('Error loading roles:', rolesError);
    }

    const usersWithRoles = profiles.map(profile => {
      const roles = userRoles?.filter(r => r.user_id === profile.id) || [];
      return {
        ...profile,
        roles: roles.map(r => ({ role: r.role }))
      };
    });

    setUsers(usersWithRoles);
    setIsLoading(false);
  };

  const handleAddRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from('user_roles')
      .insert({ 
        user_id: userId, 
        role: role as any
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('El usuario ya tiene este rol');
      } else {
        toast.error('Error al asignar rol');
      }
    } else {
      toast.success('Rol asignado correctamente');
      loadUsers();
    }
  };

  const handleRemoveRole = async (userId: string, role: string) => {
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', role as any);

    if (error) {
      toast.error('Error al eliminar rol');
    } else {
      toast.success('Rol eliminado correctamente');
      loadUsers();
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.warn('Logout warning:', error.message);
        if (error.message.includes('session')) {
          toast.info('Sesión cerrada localmente');
        } else {
          toast.error('Error al cerrar sesión: ' + error.message);
        }
      } else {
        toast.success('Sesión cerrada correctamente');
      }
    } catch (err) {
      console.error('Logout exception:', err);
      toast.error('Error inesperado al cerrar sesión');
    } finally {
      localStorage.removeItem('supabase.auth.token');
      navigate('/auth');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando usuarios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">Gestión de Usuarios</h1>
              <p className="text-sm text-muted-foreground">
                Administrar roles y permisos
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/dashboard')}>
                <Shield className="mr-2 h-4 w-4" />
                Dashboard
              </Button>
              <Button variant="outline" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Roles Actuales</TableHead>
                  <TableHead>Fecha Registro</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      {user.full_name}
                      {user.id === currentUserId && (
                        <Badge variant="outline" className="ml-2">Tú</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {user.roles.length === 0 ? (
                          <Badge variant="secondary">Sin roles</Badge>
                        ) : (
                          user.roles.map((r, idx) => (
                            <Badge 
                              key={idx}
                              variant={
                                r.role === 'superadmin' ? 'default' :
                                r.role === 'admin' ? 'default' :
                                r.role === 'revisor' ? 'secondary' :
                                'outline'
                              }
                            >
                              {r.role}
                              {user.id !== currentUserId && (
                                <button
                                  className="ml-2 hover:text-destructive"
                                  onClick={() => handleRemoveRole(user.id, r.role)}
                                >
                                  ×
                                </button>
                              )}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString('es-ES')}
                    </TableCell>
                    <TableCell>
                      {user.id !== currentUserId && (
                        <Select onValueChange={(role) => handleAddRole(user.id, role)}>
                          <SelectTrigger className="w-[180px]">
                            <UserPlus className="mr-2 h-4 w-4" />
                            <SelectValue placeholder="Añadir rol" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scanner">Scanner</SelectItem>
                            <SelectItem value="revisor">Revisor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="superadmin">SuperAdmin</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </main>
    </div>
  );
};

export default AdminUsers;