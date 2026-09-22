/**
 * RequireAuth.tsx — Role-based route guard.
 * Redirects to /login if not authenticated or wrong role.
 */
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore, AdminRole } from '../../store/authStore';

interface Props { roles: AdminRole[]; }

export function RequireAuth({ roles }: Props) {
  const { token, role } = useAuthStore();
  if (!token || !role)          return <Navigate to="/login" replace />;
  if (!roles.includes(role))    return <Navigate to="/login" replace />;
  return <Outlet />;
}
