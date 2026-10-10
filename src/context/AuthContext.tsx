import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { LoginPayload, SessionResponse, UserType } from '../lib/api';

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

const AuthContext = createContext<AuthContextValue | null>(null);

/** Convierte la respuesta del backend al formato de {@link SessionUser}. */
function toSessionUser(session: SessionResponse): SessionUser {
  return {
    name: session.name ?? '',
    userType: session.user_type,
    zoneName: session.zone_name ?? '',
  };
}

/**
 * Provee la sesión a la app y la restaura al montar con `/auth/me`.
 * Solo se guarda el nombre y el tipo de usuario; el JWT nunca llega a JavaScript,
 * vive exclusivamente en la cookie httpOnly que maneja el backend.
 *
 * @remarks `logout` llama al backend porque solo él puede borrar la cookie httpOnly,
 * y limpia el usuario local aunque esa llamada falle.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .me()
      .then((session) => {
        if (!cancelled) setUser(toSessionUser(session));
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const sessionUser = toSessionUser(await api.login(payload));
    setUser(sessionUser);
    return sessionUser;
  }, []);

  const loginWithGoogle = useCallback(async (accessToken: string) => {
    const sessionUser = toSessionUser(await api.loginWithGoogle(accessToken));
    setUser(sessionUser);
    return sessionUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, login, loginWithGoogle, logout }),
    [user, isLoading, login, loginWithGoogle, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Ruta de inicio del usuario: los ciudadanos van a la página de inicio y el personal, al dashboard. */
export function homePathFor(user: SessionUser): string {
  return user.userType === 'citizen' ? '/inicio' : '/dashboard';
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
