import { createClient } from '@supabase/supabase-js';

// Supabase solo se usa para el login con Google: la sesión real sigue siendo la
// cookie httpOnly del backend, que se obtiene canjeando el access_token en /auth/google.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: 'pkce',
      // El código de ?code= lo canjea a mano la página /auth/callback.
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
  },
);

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  });
}
