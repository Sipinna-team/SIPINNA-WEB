import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import sipinnaLogo from '../assets/sipinna.svg';
import './Login.css';

/**
 * Página `/auth/callback`. Google regresa aquí con `?code=`; se canjea por la sesión de Supabase y su
 * access_token se manda al backend, que valida la cuenta y crea la cookie httpOnly.
 * Si falla, vuelve al login con `state.googleError`.
 *
 * @remarks
 * - Si no hay `code`, Google/Supabase mandan `error_description` cuando el usuario canceló o algo falló.
 * - Al terminar se cierra la sesión local de Supabase: solo cuenta la del backend.
 * - Usa la misma tarjeta que el login para que el paso por aquí se sienta continuo.
 */
function AuthCallback() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  /** StrictMode ejecuta el efecto dos veces y el código solo se puede canjear una vez. */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fail = (googleError: string) =>
      navigate('/login', { replace: true, state: { googleError } });

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      fail(
        params.get('error_description')
          ? 'Se canceló el inicio de sesión con Google.'
          : 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.',
      );
      return;
    }

    (async () => {
      try {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const sessionUser = await loginWithGoogle(data.session.access_token);
        navigate(homePathFor(sessionUser), { replace: true });
      } catch (error) {
        console.error('Error al iniciar sesión con Google:', error);
        fail('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      } finally {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    })();
  }, [loginWithGoogle, navigate]);

  return (
    <main className="login-page">
      <div className="login-card auth-callback-card" role="status" aria-live="polite">
        <img src={sipinnaLogo} alt="Sipinna" className="login-logo" />
        <span className="spinner auth-callback-spinner" aria-hidden="true" />
        <p>Entrando con Google…</p>
      </div>
    </main>
  );
}

export default AuthCallback;
