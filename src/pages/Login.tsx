import { useState } from 'react';
import type { FormEvent } from 'react';
import './Login.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { homePathFor, useAuth } from '../context/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signInWithGoogle } from '../lib/supabase';

/**
 * Página de inicio de sesión con correo o teléfono, o con Google.
 * Si `fetch` lanza `TypeError` (sin respuesta del servidor) muestra un error de conexión.
 */
function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [correoOTelefono, setCorreoOTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const location = useLocation();
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset
  /** Error que regresa /auth/callback si falló el login con Google. */
  const googleError = (location.state as { googleError?: string } | null)?.googleError

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    /** El backend acepta email o número (no ambos): el otro va explícitamente en null. */
    const identificador = correoOTelefono.trim();
    const esCorreo = identificador.includes('@');

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const sessionUser = await login({
        email: esCorreo ? identificador : null,
        number: esCorreo ? null : identificador,
        password,
      });
      navigate(homePathFor(sessionUser), { replace: true, viewTransition: true });
    } catch (error) {
      console.error('Credenciales incorrectas:', error);
      setErrorMessage(
        error instanceof TypeError
          ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
          : 'No se pudo iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.'
      );
      setIsSubmitting(false);
    }
  };

  /** Redirige a Google; al volver, /auth/callback termina de iniciar la sesión. */
  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);

    const { error } = await signInWithGoogle();
    if (error) {
      console.error('Error al iniciar sesión con Google:', error);
      setErrorMessage('No se pudo iniciar sesión con Google. Inténtalo de nuevo.');
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <img
          src={sipinnaLogo}
          alt="Sipinna"
          className="login-logo"
        />

        <h2>Iniciar sesión</h2>
        {passwordReset && (
          <p role="status">Tu contraseña se actualizó. Ya puedes iniciar sesión.</p>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="correoOTelefono">
            Correo o número
          </label>

          <input
            id="correoOTelefono"
            type="text"
            placeholder="Ingresa tu correo o número"
            value={correoOTelefono}
            onChange={(event) =>
              setCorreoOTelefono(event.target.value)
            }
          />

          <label htmlFor="password">
            Contraseña
          </label>

          <input
            id="password"
            type="password"
            placeholder="Ingresa tu contraseña"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
          />

          <div className="login-options">
            <Link to="/forgot-password" viewTransition>
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {(errorMessage ?? googleError) && (
            <div className="login-error" role="alert">
              {errorMessage ?? googleError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <span className="login-loading">
                <span className="spinner" aria-hidden="true" />
                Cargando...
              </span>
            ) : (
              'Iniciar sesión'
            )}
          </button>
        </form>

        <div className="login-divider" aria-hidden="true">o</div>

        <button
          type="button"
          className="google-button"
          onClick={handleGoogleLogin}
          disabled={isSubmitting}
        >
          <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          Continuar con Google
        </button>

        <p>
          ¿No tienes cuenta?{' '}
          <Link to="/register" viewTransition className="register-link">
            Regístrate
          </Link>
        </p>
      </div>
    </main>
  );
}

export default Login;