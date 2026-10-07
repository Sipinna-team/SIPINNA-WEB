import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import type { LoginPayload, SessionResponse, UserType } from '../lib/api';

export type SessionUser = {
  name: string;
  userType: UserType;
  zoneName: string;
};

type AuthContextValue = {
  user: SessionUser | null;
  isLoading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  loginWithGoogle: (accessToken: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function toSessionUser(session: SessionResponse): SessionUser {
  return {
    name: session.name ?? '',
    userType: session.user_type,
    zoneName: session.zone_name ?? '',
  };
}

// Solo se guarda el nombre y el tipo de usuario; el JWT nunca llega a JavaScript,
// vive exclusivamente en la cookie httpOnly que maneja el backend.
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
    const session = await api.login(payload);
    setUser(toSessionUser(session));
  }, []);

  const loginWithGoogle = useCallback(async (accessToken: string) => {
    const session = await api.loginWithGoogle(accessToken);
    setUser(toSessionUser(session));
  }, []);

  const logout = useCallback(async () => {
    try {
      // Solo el backend puede borrar la cookie httpOnly.
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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de un <AuthProvider>');
  }

  return context;
}
