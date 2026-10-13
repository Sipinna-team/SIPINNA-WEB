import { createContext, useContext } from 'react';
import type { LoginPayload, UserType } from '../lib/api';

/** Usuario de la sesión actual, tal como lo usa la interfaz. */
export type SessionUser = {
  name: string;
  userType: UserType;
  zoneName: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<SessionUser>;
  loginWithGoogle: (accessToken: string) => Promise<SessionUser>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Ruta de inicio del usuario: los ciudadanos van a la página de inicio y el personal, al dashboard. */
export function homePathFor(user: SessionUser): string {
  return user.userType === 'citizen' ? '/inicio' : '/dashboard';
}

/** Llave de sessionStorage donde el login con Google guarda `next` mientras va a Google y regresa. */
export const NEXT_PATH_KEY = 'sipinna.next';

/**
 * A dónde ir después de iniciar sesión: `next` si es una ruta interna de la app
 * (p. ej. `/reportar`), si no la ruta de inicio del usuario.
 */
export function postLoginPath(user: SessionUser, next: string | null): string {
  const internal = next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\');
  return internal ? next! : homePathFor(user);
}

/**
 * Hook con la sesión actual y las acciones de login/logout.
 * @throws {Error} Si se usa fuera de un {@link AuthProvider}.
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }

  return context;
}
