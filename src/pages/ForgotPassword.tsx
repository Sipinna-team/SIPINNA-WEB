import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { api } from '../lib/api';

type Step = 'request' | 'reset';

function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [correoOTelefono, setCorreoOTelefono] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // El backend acepta email o número (no ambos): el otro va explícitamente en null.
  const contacto = () => {
    const identificador = correoOTelefono.trim();
    const esCorreo = identificador.includes('@');
    return {
      email: esCorreo ? identificador : null,
      number: esCorreo ? null : identificador,
    };
  };

  const toMessage = (error: unknown) =>
    error instanceof TypeError
      ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
      : error instanceof Error
        ? error.message
        : 'Ocurrió un error. Inténtalo de nuevo.';

  const sendCode = async () => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const { message } = await api.forgotPassword(contacto());
      setInfoMessage(message);
      setStep('reset');
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!correoOTelefono.trim()) {
      setErrorMessage('Ingresa tu correo o número.');
      return;
    }
    void sendCode();
  };

  const handleReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('El código debe tener 6 dígitos.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetPassword({ ...contacto(), code, new_password: password });
      navigate('/login', {
        replace: true,
        viewTransition: true,
        state: { passwordReset: true },
      });
    } catch (error) {
      setErrorMessage(toMessage(error));
      setIsSubmitting(false);
    }
  };

  const submitLabel = step === 'request' ? 'Enviar código' : 'Cambiar contraseña';

  return (
    <main className="login-page">
      <div className="login-card">
        <img src={sipinnaLogo} alt="Sipinna" className="login-logo" />
        <h2>Recuperar contraseña</h2>

        {step === 'request' ? (
          <form onSubmit={handleRequest}>
            <label htmlFor="correoOTelefono">Correo o número</label>
            <input
              id="correoOTelefono"
              type="text"
              placeholder="Ingresa tu correo o número"
              value={correoOTelefono}
              onChange={(event) => setCorreoOTelefono(event.target.value)}
            />

            {errorMessage && (
              <div className="login-error" role="alert">{errorMessage}</div>
            )}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="login-loading">
                  <span className="spinner" aria-hidden="true" />
                  Cargando...
                </span>
              ) : submitLabel}
            </button>
          </form>
        ) : (
          <form onSubmit={handleReset}>
            {infoMessage && <p>{infoMessage}</p>}

            <label htmlFor="code">Código</label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Código de 6 dígitos"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />

            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />

            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              placeholder="Repite tu contraseña"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />

            <div className="login-options">
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (!isSubmitting) void sendCode();
                }}
              >
                Reenviar código
              </a>
            </div>

            {errorMessage && (
              <div className="login-error" role="alert">{errorMessage}</div>
            )}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <span className="login-loading">
                  <span className="spinner" aria-hidden="true" />
                  Cargando...
                </span>
              ) : submitLabel}
            </button>
          </form>
        )}

        <p>
          <Link to="/login" viewTransition className="register-link">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}

export default ForgotPassword;