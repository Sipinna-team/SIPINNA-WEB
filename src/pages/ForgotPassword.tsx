import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Login.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { api } from '../lib/api';
import { OtpInput, type OtpStatus } from '@/components/ui/otp-input';

/** Paso del flujo: pedir código, capturarlo y elegir nueva contraseña. */
type Step = 'request' | 'code' | 'password';

/** Página de recuperación de contraseña por código enviado a correo o teléfono. */
function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('request');
  const [correoOTelefono, setCorreoOTelefono] = useState('');
  const [code, setCode] = useState('');
  const [codeStatus, setCodeStatus] = useState<OtpStatus>('idle');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  /** El backend acepta email o número (no ambos): el otro va explícitamente en null. */
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
      setCode('');
      setCodeStatus('idle');
      setStep('code');
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

  const handleCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('El código debe tener 6 dígitos.');
      setCodeStatus('error');
      return;
    }
    setCodeStatus('success');
    setStep('password');
  };

  const handlePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
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
      if (!(error instanceof TypeError)) {
        setCodeStatus('error');
        setStep('code');
      }
    }
  };

  const goBack = (to: Step) => {
    setErrorMessage(null);
    setStep(to);
  };

  const submitLabel = {
    request: 'Enviar código',
    code: 'Validar código',
    password: 'Cambiar contraseña',
  }[step];

  const errorAndSubmit = (
    <>
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
    </>
  );

  const backLink = (to: Step, label: string) => (
    <div className="login-options">
      <a
        href="#"
        onClick={(event) => {
          event.preventDefault();
          if (!isSubmitting) goBack(to);
        }}
      >
        {label}
      </a>
    </div>
  );

  return (
    <main className="login-page">
      <div className="login-card">
        <img src={sipinnaLogo} alt="Sipinna" className="login-logo" />
        <h2>Recuperar contraseña</h2>

        {step === 'request' && (
          <form onSubmit={handleRequest}>
            <label htmlFor="correoOTelefono">Correo o número</label>
            <input
              id="correoOTelefono"
              type="text"
              placeholder="Ingresa tu correo o número"
              value={correoOTelefono}
              onChange={(event) => setCorreoOTelefono(event.target.value)}
            />

            {errorAndSubmit}
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCode}>
            {infoMessage && <p>{infoMessage}</p>}

            <label id="code-label">Código</label>
            <OtpInput
              role="group"
              aria-labelledby="code-label"
              className="self-center"
              length={6}
              type="numbers"
              size="sm"
              autoFocus
              value={code}
              status={codeStatus}
              onChange={(value) => {
                setCode(value);
                setCodeStatus('idle');
              }}
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

            {errorAndSubmit}
          </form>
        )}

        {step === 'password' && (
          <form onSubmit={handlePassword}>
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              placeholder="Mínimo 6 caracteres"
              autoFocus
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

            {backLink('code', 'Cambiar código')}
            {errorAndSubmit}
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
