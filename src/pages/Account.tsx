import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from '../context/auth';
import { api } from '../lib/api';
import type { AccountProfile } from '../lib/api';
import sipinnaLogo from '../assets/sipinna.svg';
import './Account.css';

const errorText = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la operación.';

export default function Account() {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.getProfile(controller.signal).then((data) => {
      setProfile(data);
    }).catch((err) => {
      if (!controller.signal.aborted) setLoadError(errorText(err));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  async function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
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
          <p className="account-intro">{profile.nombre} · {profile.user_type === 'citizen' ? 'Ciudadano' : profile.user_type === 'administrador' ? 'Administrador' : 'Alimentador'}</p>
          {error && <p className="account-error" role="alert">{error}</p>}
          <section className="account-danger" aria-labelledby="delete-title">
            <h2 id="delete-title">Eliminar mi cuenta</h2>
            <p>Se eliminarán tus datos de cuenta y se cerrarán tus sesiones. Los reportes y el historial de atención se conservarán sin vínculo a tu cuenta. Esta acción es permanente.</p>
            {!confirming ? <button className="sip-btn sip-btn--secondary" disabled={busy} onClick={() => { setConfirming(true); setError(''); }}>Eliminar mi cuenta</button> : <form onSubmit={remove}>
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
