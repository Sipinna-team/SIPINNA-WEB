import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { LoginPayload, SessionResponse } from '../lib/api';
import { AuthContext } from './auth';
import type { SessionUser } from './auth';

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
