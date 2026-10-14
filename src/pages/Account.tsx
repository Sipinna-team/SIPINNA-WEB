import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/auth';
import { api } from '../lib/api';
import type { AccountProfile, UpdateProfilePayload } from '../lib/api';
import sipinnaLogo from '../assets/sipinna.svg';
import './Account.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';

export default function Account() {
  const { user, updateProfile, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [form, setForm] = useState<UpdateProfilePayload>({ nombre: '', edad: 0, genero: '', email: '', telefono: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.getProfile(controller.signal).then((data) => {
      setProfile(data);
      setForm({ nombre: data.nombre, edad: data.edad, genero: data.genero, email: data.email ?? '', telefono: data.telefono ?? '' });
    }).catch((err) => {
      if (!controller.signal.aborted) setLoadError(errorText(err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const payload = { ...form, nombre: form.nombre.trim(), email: form.email.trim(), telefono: form.telefono.trim() };
    if (!payload.nombre || (!payload.email && !payload.telefono)) {
      setError('Ingresa tu nombre y al menos un correo o teléfono.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile(payload);
      setForm(payload);
      setMessage('Tu perfil se actualizó correctamente.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await deleteAccount(confirmation);
      navigate('/inicio', { replace: true });
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <main className="account-page">
      <header className="account-header">
        <img src={sipinnaLogo} alt="SIPINNA" />
        <Link to={user ? homePathFor(user) : '/inicio'}>Volver al inicio</Link>
      </header>
      <section className="account-card" aria-labelledby="account-title">
        <h1 id="account-title">Mi cuenta</h1>
        {loading && <p role="status">Cargando tu información…</p>}
        {loadError && <div role="alert"><p>{loadError}</p><button className="sip-btn sip-btn--secondary" onClick={() => { setLoadError(''); setLoading(true); setAttempt(attempt + 1); }}>Reintentar</button></div>}
        {profile && !loading && !loadError && <>
          <p className="account-intro">{profile.user_type === 'citizen' ? 'Actualiza la información de tu perfil.' : `${profile.nombre} · ${profile.user_type === 'administrador' ? 'Administrador' : 'Alimentador'}`}</p>
          {profile.user_type === 'citizen' && <form onSubmit={save}>
            <fieldset disabled={busy || confirming} className="account-fields">
              <label htmlFor="account-name">Nombre completo<input id="account-name" autoComplete="name" required maxLength={200} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></label>
              <div className="account-row">
                <label htmlFor="account-age">Edad<input id="account-age" type="number" min={0} max={120} required value={form.edad} onChange={(e) => setForm({ ...form, edad: Number(e.target.value) })} /></label>
                <label htmlFor="account-gender">Género<select id="account-gender" value={form.genero} onChange={(e) => setForm({ ...form, genero: e.target.value })}>
                  <option value="">Sin especificar</option><option value="mujer">Mujer</option><option value="hombre">Hombre</option><option value="otro">Otro</option><option value="prefiero-no-decir">Prefiero no decirlo</option>
                </select></label>
              </div>
              <label htmlFor="account-email">Correo electrónico<input id="account-email" type="email" autoComplete="email" maxLength={254} readOnly={!profile.has_password} aria-describedby={!profile.has_password ? 'account-google-help' : undefined} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              {!profile.has_password && <p id="account-google-help" className="account-help">Tu correo está vinculado a Google. Para cambiarlo, primero define una contraseña desde <Link to="/forgot-password">recuperar contraseña</Link>.</p>}
              <label htmlFor="account-phone">Teléfono<input id="account-phone" type="tel" autoComplete="tel" pattern="\+[1-9][0-9]{1,14}" placeholder="+525512345678" aria-describedby="account-contact-help" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
              <p id="account-contact-help" className="account-help">Ingresa correo, teléfono o ambos. El teléfono debe incluir + y el código del país, sin espacios.</p>
              <button className="sip-btn sip-btn--primary" type="submit">{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            </fieldset>
          </form>}
          {message && <p className="account-success" role="status">{message}</p>}
          {error && <p className="account-error" role="alert">{error}</p>}
          <section className="account-danger" aria-labelledby="delete-title">
            <h2 id="delete-title">Eliminar mi cuenta</h2>
            <p>Se eliminarán tus datos de cuenta y se cerrarán tus sesiones. Los reportes y el historial de atención se conservarán sin vínculo a tu cuenta. Esta acción es permanente.</p>
            {!confirming ? <button className="sip-btn sip-btn--secondary" disabled={busy} onClick={() => { setConfirming(true); setError(''); setMessage(''); }}>Eliminar mi cuenta</button> : <form onSubmit={remove}>
              <label htmlFor="account-confirmation">Escribe ELIMINAR para confirmar<input id="account-confirmation" autoFocus autoComplete="off" required value={confirmation} disabled={busy} onChange={(e) => setConfirmation(e.target.value)} /></label>
              <div className="account-actions">
                <button className="sip-btn sip-btn--primary" type="submit" disabled={busy || confirmation !== 'ELIMINAR'}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
                <button className="sip-btn sip-btn--secondary" type="button" disabled={busy} onClick={() => { setConfirming(false); setConfirmation(''); setError(''); }}>Cancelar</button>
              </div>
            </form>}
          </section>
        </>}
      </section>
    </main>
  );
}
