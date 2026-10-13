import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import './Login.css';
import './ForgotPassword.css';
import sipinnaLogo from '../assets/sipinna.svg';
import { api } from '../lib/api';
import type { Invitation } from '../lib/api';
import { homePathFor, useAuth } from '../context/auth';
import { passwordError, PASSWORD_MIN_LENGTH, PASSWORD_REQUIREMENTS } from '../lib/passwordPolicy';

const ROLE_LABELS: Record<Invitation['rol'], string> = {
  administrador: 'Administrador',
  alimentador: 'Alimentador',
};

/** Estado de la página: cargando la invitación, lista para aceptar, inválida o rechazada. */
type Status = 'loading' | 'ready' | 'invalid' | 'rejected';

const toMessage = (error: unknown) =>
  error instanceof TypeError
    ? 'No se pudo conectar con el servidor. Inténtalo de nuevo.'
    : error instanceof Error
      ? error.message
      : 'Ocurrió un error. Inténtalo de nuevo.';

/**
 * Página del enlace de invitación (`/aceptar-invitacion?token=…`): muestra la cuenta
 * invitada y permite aceptarla creando la contraseña, lo que activa la cuenta e
 * inicia sesión, o rechazarla, lo que la borra.
 */
function AcceptInvitation() {
  const navigate = useNavigate();
  const { acceptInvitation } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  // Se guarda al montar porque enseguida se quita de la URL.
  const [token] = useState(() => searchParams.get('token') ?? '');
  const [status, setStatus] = useState<Status>(token ? 'loading' : 'invalid');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quita el token de la barra de direcciones para que no quede en el historial ni se
  // comparta al copiar la URL. `replace` reemplaza la entrada en vez de agregar otra.
  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!token) return;
    const abortController = new AbortController();

    api
      .getInvitation(token, abortController.signal)
      .then((data) => {
        setInvitation(data);
        setStatus('ready');
      })
      .catch((error) => {
        if (abortController.signal.aborted) return;
        setErrorMessage(toMessage(error));
        setStatus('invalid');
      });

    return () => abortController.abort();
  }, [token]);

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    const validationError = passwordError(password);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await acceptInvitation(token, password);
      navigate(homePathFor(user), { replace: true, viewTransition: true });
    } catch (error) {
      setErrorMessage(toMessage(error));
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!window.confirm('¿Rechazar la invitación? Tu cuenta se eliminará y el enlace dejará de funcionar.')) return;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      await api.rejectInvitation(token);
      setStatus('rejected');
    } catch (error) {
      setErrorMessage(toMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const zone = invitation?.rol === 'alimentador' ? invitation.zona_nombre || 'Sin zona' : 'Todas las zonas';

  return (
    <main className="login-page recovery-page">
      <div className="login-card recovery-card">
        <aside className="recovery-guide" aria-label="Tu invitación">
          <img src={sipinnaLogo} alt="Sipinna" className="login-logo" />
          <h1>Únete a SIPINNA</h1>
          <p>Te invitaron a formar parte del personal que atiende los reportes de trabajo infantil.</p>
          {invitation && (
            <ol className="recovery-steps">
              {([
                ['Nombre', invitation.nombre || 'Sin nombre'],
                ['Correo', invitation.email ?? ''],
                ['Rol', ROLE_LABELS[invitation.rol] ?? invitation.rol],
                ['Zona', zone],
              ] as const).map(([title, value], index) => (
                <li key={title}>
                  <span className="recovery-step-number" aria-hidden="true">{index + 1}</span>
                  <div><strong>{title}</strong><span>{value}</span></div>
                </li>
              ))}
            </ol>
          )}
        </aside>
        <section className="recovery-content" aria-labelledby="invitation-title">
          <h2 id="invitation-title">Aceptar invitación</h2>

          {status === 'loading' && <p className="recovery-intro" role="status">Cargando invitación…</p>}

          {status === 'invalid' && (
            <p className="recovery-intro">
              {errorMessage ?? 'El enlace no es válido.'} Pide a un administrador que te envíe una nueva invitación.
            </p>
          )}

          {status === 'rejected' && (
            <p className="recovery-intro" role="status">Rechazaste la invitación. Tu cuenta se eliminó.</p>
          )}

          {status === 'ready' && (
            <>
              <p className="recovery-intro">
                Crea tu contraseña para activar tu cuenta como {ROLE_LABELS[invitation!.rol] ?? invitation!.rol}.
              </p>
              <form onSubmit={handleAccept}>
                <label htmlFor="password">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="invitation-password-requirements"
                  placeholder="Mínimo 10 caracteres"
                  autoFocus
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />

                <label htmlFor="confirmPassword">Confirmar contraseña</label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={PASSWORD_MIN_LENGTH}
                  autoComplete="new-password"
                  aria-describedby="invitation-password-requirements"
                  placeholder="Repite tu contraseña"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />

                <p id="invitation-password-requirements" className="password-requirements">{PASSWORD_REQUIREMENTS}</p>

                <div className="login-options">
                  <a
                    href="#"
                    onClick={(event) => {
                      event.preventDefault();
                      if (!isSubmitting) void handleReject();
                    }}
                  >
                    No quiero unirme, rechazar invitación
                  </a>
                </div>

                {errorMessage && <div className="login-error" role="alert">{errorMessage}</div>}

                <button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="login-loading">
                      <span className="spinner" aria-hidden="true" />
                      Cargando...
                    </span>
                  ) : 'Aceptar y activar cuenta'}
                </button>
              </form>
            </>
          )}

          <p>
            <Link to="/login" viewTransition className="register-link">
              Ir a iniciar sesión
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}

export default AcceptInvitation;
