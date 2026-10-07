import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import sipinnaLogo from '../assets/sipinna.svg';
import './Login.css';

// Google regresa aquí con ?code=; se canjea por la sesión de Supabase y su
// access_token se manda al backend, que valida la cuenta y crea la cookie httpOnly.
function AuthCallback() {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  // StrictMode ejecuta el efecto dos veces y el código solo se puede canjear una vez.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fail = (googleError: string) =>
      navigate('/login', { replace: true, state: { googleError } });

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');

    if (!code) {
      // Google/Supabase mandan error_description si el usuario canceló o algo falló.
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

        await loginWithGoogle(data.session.access_token);
        navigate('/dashboard', { replace: true });
      } catch (error) {
        console.error('Error al iniciar sesión con Google:', error);
        fail('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      } finally {
        // La sesión de Supabase ya no se necesita: la del backend es la que cuenta.
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      }
    })();
  }, [loginWithGoogle, navigate]);

  // Misma tarjeta que el login para que el paso por aquí se sienta continuo.
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
