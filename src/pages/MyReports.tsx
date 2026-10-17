import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import PublicReportLayout from '../components/PublicReportLayout';
import { homePathFor, useAuth } from '../context/auth';
import { api, type CitizenReport } from '../lib/api';
import { filterCitizenReports, prepareCitizenReports, PUBLIC_REPORT_STEPS, publicStatusLabel } from '../lib/citizenReports';
import './MyReports.css';

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

/** Historial de la cuenta; sin sesión se consulta con folio y clave. */
export default function MyReports() {
  const { user, isLoading } = useAuth();
  if (user && user.userType !== 'citizen') return <Navigate to={homePathFor(user)} replace />;

  return (
    <PublicReportLayout variant="reading">
      <section className="rf-card sip-card my-reports" aria-labelledby="my-reports-title">
        <div className="rf-title">
          <span className="my-reports__eyebrow">Seguimiento ciudadano</span>
          <h1 id="my-reports-title">Mis reportes</h1>
          <p>Consulta lo que has reportado y conoce el estado de su atención.</p>
        </div>
        {isLoading ? <p role="status">Cargando tu sesión…</p> : user ? <CitizenReportList /> : (
          <div className="my-reports__empty">
            <h2>Todos tus reportes, en un solo lugar</h2>
            <p>Inicia sesión para ver los reportes que enviaste desde tu cuenta y buscarlos por folio.</p>
            <Link to="/login?next=/mis-reportes" className="sip-btn sip-btn--primary">Iniciar sesión</Link>
            <p>¿Aún no tienes cuenta? <Link to="/register">Regístrate</Link>.</p>
          </div>
        )}
        <aside className="my-reports__anonymous">
          <strong>¿Hiciste un reporte sin iniciar sesión?</strong>
          <p>Consúltalo con el folio y la clave que recibiste. Los reportes anónimos no se vinculan a tu cuenta.</p>
          <Link to="/consultar-folio">Consultar con folio y clave <span aria-hidden="true">→</span></Link>
        </aside>
      </section>
    </PublicReportLayout>
  );
}

function CitizenReportList() {
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    api.getMyReports(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setReports(prepareCitizenReports(data.reports ?? []));
          setError(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('No pudimos cargar tus reportes. Intenta de nuevo.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);

  const visibleReports = filterCitizenReports(reports, query, status);
  const hasFilters = query.trim() !== '' || status !== '';

  return (
    <>
      <div className="my-reports__heading">
        <p className="rf-muted">Este historial muestra únicamente los reportes enviados desde tu cuenta.</p>
        <Link to="/reportar" className="sip-btn sip-btn--primary">Hacer un reporte</Link>
      </div>
      {!loading && !error && reports.length > 0 && (
        <>
          <div className="my-reports__filters" role="search" aria-label="Buscar en mis reportes">
            <label>
              <span>Buscar por folio</span>
              <input className="rf-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. RIETI-ATZ-2026-000123" />
            </label>
            <label>
              <span>Estado del reporte</span>
              <select className="rf-input" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Todos los estados</option>
                {PUBLIC_REPORT_STEPS.map((step) => <option key={step.key} value={step.key}>{step.label}</option>)}
              </select>
            </label>
          </div>
          <p className="my-reports__count" role="status">Mostrando {visibleReports.length} de {reports.length} reportes</p>
        </>
      )}
      {loading && <p role="status">Cargando tus reportes…</p>}
      {error && (
        <div className="my-reports__empty">
          <p className="rf-error" role="alert">{error}</p>
          <button className="sip-btn sip-btn--secondary" type="button" onClick={() => { setLoading(true); setError(null); setAttempt((value) => value + 1); }}>Reintentar</button>
        </div>
      )}
      {!loading && !error && visibleReports.length === 0 && (
        <div className="my-reports__empty">
          <h2>{reports.length === 0 ? 'Todavía no has enviado reportes desde esta cuenta' : 'No encontramos reportes con esos filtros'}</h2>
          <p>{reports.length === 0 ? 'Cuando envíes un reporte con tu sesión iniciada, podrás seguir su avance aquí.' : 'Revisa el folio o selecciona otro estado.'}</p>
          {hasFilters && <button className="sip-btn sip-btn--secondary" type="button" onClick={() => { setQuery(''); setStatus(''); }}>Limpiar búsqueda</button>}
        </div>
      )}
      {!loading && !error && visibleReports.length > 0 && (
        <ul className="my-reports__list" aria-label="Reportes enviados">
          {visibleReports.map((report) => (
            <li key={report.folio}>
              <article className="my-reports__item" aria-label={`Reporte ${report.folio}`}>
                <div className="my-reports__item-heading">
                  <h2>{report.folio}</h2>
                  <span className={`my-reports__status my-reports__status--${report.report_state}`}>{publicStatusLabel(report.report_state)}</span>
                </div>
                <p className="my-reports__description">{report.description || 'Sin descripción.'}</p>
                <dl className="my-reports__dates">
                  <div><dt>Enviado</dt><dd><time dateTime={report.created_at}>{formatDate(report.created_at)}</time></dd></div>
                  <div><dt>Última actualización</dt><dd><time dateTime={report.state_changed_at}>{formatDate(report.state_changed_at)}</time></dd></div>
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}
      <p className="rf-muted my-reports__privacy">Para proteger a niñas, niños y adolescentes, mostramos estados generales y tu descripción original. Las acciones y datos del expediente interno son reservados.</p>
    </>
  );
}
