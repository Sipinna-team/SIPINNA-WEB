import { Navigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/AuthContext';

/**
 * Redirige `/` al login o a la página de inicio del usuario.
 * La cookie de sesión es httpOnly, así que JS no puede leerla: se decide
 * con el resultado de `/auth/me` que ya resuelve AuthContext.
 */
function RootRedirect() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <p>Cargando...</p>;
  return <Navigate to={user === null ? '/login' : homePathFor(user)} replace />;
}

export default RootRedirect;
