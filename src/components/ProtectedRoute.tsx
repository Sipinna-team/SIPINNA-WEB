import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Muestra `children` solo con sesión iniciada; si no, redirige a `/login`. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p>Cargando...</p>;
  if (user === null) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default ProtectedRoute;
