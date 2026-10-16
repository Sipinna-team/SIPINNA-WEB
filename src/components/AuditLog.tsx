import { useEffect, useState } from 'react';
import { api, type LogEntry } from '../lib/api';
import { describeAuditAction, describeAuditResult } from '../lib/auditLog';

const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

/** Bitácora para administradores; carga al abrir el panel. */
export default function AuditLog() {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const abortController = new AbortController();
    api
      .getLog(abortController.signal)
      .then((data) => {
        setEntries(data.entries ?? []);
        setError(null);
      })
      .catch((requestError) => {
        if (!abortController.signal.aborted) {
          setError(requestError instanceof Error ? requestError.message : 'No se pudo cargar la bitácora');
        }
      });
    return () => abortController.abort();
  }, [open]);

  return (
    <details className="staff audit-log" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="dashboard-subtitle">Bitácora de accesos y actividad</summary>
      {open && <p className="dashboard-muted">Permite revisar quién consultó información o solicitó cambios y cuál fue el resultado. Las fechas se muestran en tu hora local.</p>}
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {open && !entries && !error && <p className="dashboard-muted">Cargando…</p>}
      {entries && entries.length === 0 && <p className="dashboard-muted">Sin registros todavía.</p>}
      {entries && entries.length > 0 && (
        <div className="audit-log__scroll">
          <table className="audit-log__table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Usuario</th>
                <th scope="col">Acción</th>
                <th scope="col">Recurso</th>
                <th scope="col">Resultado</th>
                <th scope="col">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => {
                const { action, resource } = describeAuditAction(entry);
                return (
                <tr key={`${entry.created_at}-${index}`}>
                  <td>{dateFormatter.format(new Date(entry.created_at))}</td>
                  <td>{entry.user_name || '—'}</td>
                  <td>{action}</td>
                  <td className="audit-log__resource">{resource}</td>
                  <td>{describeAuditResult(entry.status, entry.method)}</td>
                  <td>
                    <details>
                      <summary>Detalle técnico</summary>
                      <p><code>{entry.method} {entry.path}</code></p>
                      <p>Estado HTTP: {entry.status}</p>
                      <p>IP: {entry.ip || 'No disponible'}</p>
                    </details>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
