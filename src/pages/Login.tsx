import { useState } from 'react';
import type { FormEvent } from 'react';
import './Login.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { useAuth } from '../context/AuthContext';
import { Link, useLocation, useNavigate } from 'react-router-dom';

function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [correoOTelefono, setCorreoOTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const location = useLocation();
  const passwordReset = (location.state as { passwordReset?: boolean } | null)?.passwordReset

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    // El backend acepta email o número (no ambos): el otro va explícitamente en null.
    const identificador = correoOTelefono.trim();
    const esCorreo = identificador.includes('@');

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({
        email: esCorreo ? identificador : null,
        number: esCorreo ? null : identificador,
        password,
      });
      navigate('/dashboard', { replace: true, viewTransition: true });
    } catch (error) {
      console.error('Credenciales incorrectas:', error);
      // fetch lanza TypeError cuando no hay respuesta del servidor
      setErrorMessage(
        error instanceof TypeError
          ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
          : 'No se pudo iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.'
      );
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

          {errorMessage && (
            <div className="login-error" role="alert">
              {errorMessage}
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