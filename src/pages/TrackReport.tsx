import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, type PublicReport } from '../lib/api';
import { PUBLIC_REPORT_STEPS } from '../lib/citizenReports';
import PublicReportLayout from '../components/PublicReportLayout';

/** Consulta pública con folio y clave; acepta enlaces desde el correo. */
function TrackReport() {
  const [params] = useSearchParams();
  const [folio, setFolio] = useState(params.get('folio') ?? '');
  const [clave, setClave] = useState(params.get('clave') ?? '');
  const [report, setReport] = useState<PublicReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState(() => {
    const initialFolio = params.get('folio');
    const initialClave = params.get('clave');
    return initialFolio && initialClave ? { folio: initialFolio, clave: initialClave } : null;
  });
  const [loading, setLoading] = useState(Boolean(lookup));

  useEffect(() => {
    if (!lookup) return;
    const controller = new AbortController();
    api.getPublicReport(lookup.folio.trim().toUpperCase(), lookup.clave.trim(), controller.signal)
      .then(({ report }) => {
        if (!controller.signal.aborted) setReport(report);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError('No encontramos un reporte con ese folio y clave. Revisa que estén bien escritos.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [lookup]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !folio.trim() || !clave.trim()) return;
    setLoading(true);
    setError(null);
    setReport(null);
    setLookup({ folio, clave });
  }

  const current = report ? PUBLIC_REPORT_STEPS.findIndex((step) => step.key === report.status) : -1;

  return (
    <PublicReportLayout>
      <section className="rf-card sip-card" aria-labelledby="track-title">
        <div className="rf-title">
          <h1 id="track-title">Consulta con folio y clave</h1>
          <p>Escribe el folio y la clave de consulta que recibiste al enviar tu reporte.</p>
        </div>

        <p className="rf-muted">¿Lo enviaste desde tu cuenta? <Link to="/mis-reportes">Ver mis reportes</Link></p>

        <form className="rf-form" onSubmit={handleSubmit}>
          <label className="rf-label" htmlFor="track-folio">
            Folio
          </label>
          <input
            id="track-folio"
            className="rf-input"
            value={folio}
            onChange={(event) => setFolio(event.target.value)}
            placeholder="RIETI-ATZ-2026-000123"
            autoComplete="off"
          />
          <label className="rf-label" htmlFor="track-clave">
            Clave de consulta
          </label>
          <input
            id="track-clave"
            className="rf-input"
            value={clave}
            onChange={(event) => setClave(event.target.value)}
            autoComplete="off"
          />
          <button
            type="submit"
            className="sip-btn sip-btn--primary sip-btn--block"
            disabled={loading || !folio.trim() || !clave.trim()}
            aria-busy={loading}
          >
            {loading ? 'Consultando…' : 'Consultar'}
          </button>
        </form>

        {error && (
          <p className="rf-error" role="alert">
            {error}
          </p>
        )}

        {report && (
          <div className="rf-summary" aria-live="polite">
            <section className="rf-summary-row">
              <div className="rf-summary-head">
                <h2>{report.folio}</h2>
              </div>
              <ol className="rf-track">
                {PUBLIC_REPORT_STEPS.map((step, index) => (
                  <li key={step.key} className={index <= current ? 'is-done' : undefined} aria-current={index === current ? 'step' : undefined}>
                    {step.label}
                  </li>
                ))}
              </ol>
              <p className="rf-muted">
                Enviado el {new Date(report.created_at).toLocaleDateString('es-MX', { dateStyle: 'long' })}. Último
                cambio: {new Date(report.state_changed_at).toLocaleDateString('es-MX', { dateStyle: 'long' })}.
              </p>
            </section>
            <p className="rf-muted rf-center">
              Por la protección de niñas, niños y adolescentes, solo mostramos el estado general del reporte.
            </p>
          </div>
        )}
      </section>
    </PublicReportLayout>
  );
}

export default TrackReport;
