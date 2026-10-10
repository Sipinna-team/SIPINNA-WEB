import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de Supabase. Solo se usa para el login con Google: la sesión real sigue siendo la
 * cookie httpOnly del backend, que se obtiene canjeando el access_token en `/auth/google`.
 * El `?code=` no se detecta solo: lo canjea a mano la página `/auth/callback`.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  },
);

/**
 * Redirige a Google para iniciar sesión. Al volver, `/auth/callback` canjea el código.
 * @returns La promesa de `signInWithOAuth` de Supabase.
 */
export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}
