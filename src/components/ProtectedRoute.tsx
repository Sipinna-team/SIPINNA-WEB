import { Navigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/auth';
import type { UserType } from '../lib/api';

/**
 * Muestra `children` solo con sesión iniciada; si no, redirige a `/login`.
 * Con `roles`, un usuario de otro rol regresa a su pantalla de inicio (la API también valida el rol).
 */
function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: UserType[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p className="sip-loading" role="status">Cargando...</p>;
  if (user === null) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.userType)) return <Navigate to={homePathFor(user)} replace />;
  return <>{children}</>;
}

export default ProtectedRoute;
