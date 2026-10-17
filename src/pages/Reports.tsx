import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css';
import './Reports.css';
import { useAuth } from '../context/auth';
import { api } from '../lib/api';
import type { Report } from '../lib/api';
import type { StateKey } from '../lib/dashboardStats';
import {
  FALSE_REPORT_THRESHOLD,
  STATES,
  normalizeState,
  quantityLabel,
  simplify,
  workTypeLabels,
} from '../lib/dashboardStats';
import {
  exportReportsCsv,
  exportReportsPdf,
  formatReportDate,
  formatSuspicion,
} from '../lib/reportExport';

/** Igual que en el dashboard, para que ambos cuenten los mismos reportes. */
const REPORTS_ZONE: string | undefined = import.meta.env.VITE_REPORTS_ZONE?.trim() || undefined;
const PAGE_SIZES = [10, 25, 50, 100];

type Veracity = '' | 'veridico' | 'falso';
type Sort = 'recientes' | 'antiguos' | 'sospecha' | 'prioridad';

/** Filtros de la tabla de reportes; los vacíos no filtran. */
type Filters = {
  search: string;
  state: StateKey | '';
  zone: string;
  type: string;
  veracity: Veracity;
  priority: '' | 'alta' | 'normal';
  from: string;
  to: string;
  sort: Sort;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  state: '',
  zone: '',
  type: '',
  veracity: '',
  priority: '',
  from: '',
  to: '',
  sort: 'recientes',
};

/**
 * Convierte una fecha de `<input type="date">` ("YYYY-MM-DD", hora local) en milisegundos.
 * @param offsetDays - Días a sumar.
 */
function localDay(value: string, offsetDays = 0) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day! + offsetDays).getTime();
}

/** Filtra y ordena los reportes según los filtros. */
function applyFilters(reports: Report[], filters: Filters) {
  const query = simplify(filters.search);
  const from = filters.from ? localDay(filters.from) : -Infinity;
  /** "Hasta" incluye todo ese día. */
  const to = filters.to ? localDay(filters.to, 1) : Infinity;

  const result = reports.filter((report) => {
    if (filters.state && normalizeState(report.last_state) !== filters.state) return false;
    if (filters.zone && (report.zone_name || 'Sin zona') !== filters.zone) return false;
    if (filters.type && !workTypeLabels(report.work_type).includes(filters.type)) return false;
    if (filters.priority && (report.priority || 'normal') !== filters.priority) return false;
    if (filters.veracity) {
      const isFalse = report.suspicius_level >= FALSE_REPORT_THRESHOLD;
      if (isFalse !== (filters.veracity === 'falso')) return false;
    }
    const created = Date.parse(report.created_at);
    if (created < from || created >= to) return false;
    if (query) {
      const haystack = simplify(
        [report.folio, report.description, report.citizen_name, report.zone_name, report.work_type].join(' '),
      );
      if (!haystack.includes(query)) return false;
    }
    return true;
  });

  const urgency = (report: Report) => (report.priority === 'alta' ? 1 : 0);
  return result.sort((a, b) =>
    filters.sort === 'sospecha'
      ? b.suspicius_level - a.suspicius_level
      : filters.sort === 'prioridad' && urgency(a) !== urgency(b)
        ? urgency(b) - urgency(a)
        : (Date.parse(b.created_at) - Date.parse(a.created_at)) * (filters.sort === 'antiguos' ? -1 : 1),
  );
}

/** Texto de los filtros activos para el encabezado del PDF. */
function describeFilters(filters: Filters) {
  const parts: string[] = [];
  if (filters.search.trim()) parts.push(`Búsqueda: "${filters.search.trim()}"`);
  if (filters.state) parts.push(`Estado: ${STATES.find((s) => s.key === filters.state)!.label}`);
  if (filters.zone) parts.push(`Zona: ${filters.zone}`);
  if (filters.type) parts.push(`Tipo: ${filters.type}`);
  if (filters.veracity) parts.push(filters.veracity === 'falso' ? 'Solo falsos' : 'Solo verídicos');
  if (filters.priority) parts.push(`Prioridad: ${filters.priority}`);
  if (filters.from) parts.push(`Desde: ${filters.from}`);
  if (filters.to) parts.push(`Hasta: ${filters.to}`);
  return parts.length > 0 ? `Filtros: ${parts.join(' · ')}` : 'Sin filtros';
}

/** Números de página a mostrar, con "…" cuando hay muchas. */
function pageItems(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1]! > 1 ? ['…' as const, p] : [p]));
}

/**
 * Página `/reports`: tabla paginada de reportes con filtros y exportación a CSV/PDF.
 * El filtro de zona solo aparece al administrador; el alimentador solo recibe reportes de su zona.
 */
function Reports() {
  const { user } = useAuth();
  const isAdmin = user?.userType === 'administrador';
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]!);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const scrollToResultsRef = useRef(false);

  useEffect(() => {
    const abortController = new AbortController();

    const request = REPORTS_ZONE
      ? api.getReportsByZone(REPORTS_ZONE, abortController.signal)
      : api.getAllReports(abortController.signal);

    request
      .then((data) => setReports(data.reports ?? []))
      .catch((err) => {
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudieron cargar los reportes');
        }
      })
      .finally(() => {
        if (!abortController.signal.aborted) setLoading(false);
      });

    return () => abortController.abort();
  }, []);

  /** Las opciones de zona y tipo salen de los reportes que sí existen. */
  const zoneOptions = useMemo(
    () => [...new Set(reports.map((r) => r.zone_name || 'Sin zona'))].sort((a, b) => a.localeCompare(b, 'es')),
    [reports],
  );
  const typeOptions = useMemo(
    () => [...new Set(reports.flatMap((report) => workTypeLabels(report.work_type)))].sort((a, b) => a.localeCompare(b, 'es')),
    [reports],
  );

  const filtered = useMemo(() => applyFilters(reports, filters), [reports, filters]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageReports = filtered.slice(pageStart, pageStart + pageSize);
  const hasFilters = JSON.stringify({ ...filters, sort: '' }) !== JSON.stringify({ ...EMPTY_FILTERS, sort: '' });

  // Desplaza después de renderizar los nuevos resultados, solo al usar la paginación.
  useEffect(() => {
    if (!scrollToResultsRef.current) return;
    scrollToResultsRef.current = false;
    resultsRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }, [currentPage, pageSize]);

  function changePage(nextPage: number) {
    if (nextPage === currentPage) return;
    scrollToResultsRef.current = true;
    setPage(nextPage);
  }

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters((current) => ({ ...EMPTY_FILTERS, sort: current.sort }));
    setPage(1);
  }

  async function handleExport(format: 'csv' | 'pdf') {
    setExportError(null);
    if (format === 'csv') {
      exportReportsCsv(filtered);
      return;
    }
    setExporting(true);
    try {
      await exportReportsPdf(filtered, describeFilters(filters));
    } catch (err) {
      console.error('Error al generar el PDF', err);
      setExportError('No se pudo generar el PDF. Inténtalo de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main className="dashboard-page reports-page" aria-labelledby="reports-title">
      <header className="reports-header">
        <Link to="/dashboard" viewTransition className="reports-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Dashboard
        </Link>
        <h1 id="reports-title">Reportes</h1>
        <div className="reports-export">
          <button
            type="button"
            className="reports-button"
            disabled={loading || filtered.length === 0}
            onClick={() => void handleExport('csv')}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="reports-button"
            disabled={loading || exporting || filtered.length === 0}
            onClick={() => void handleExport('pdf')}
          >
            {exporting ? 'Generando…' : 'Exportar PDF'}
          </button>
        </div>
      </header>

      {error && <p className="dashboard-error" role="alert">{error}</p>}
      {exportError && <p className="dashboard-error" role="alert">{exportError}</p>}

      <section className="dashboard-panel reports-filters" aria-label="Filtros">
        <label className="reports-field reports-field--search">
          Buscar
          <input
            type="search"
            placeholder="Folio, descripción, ciudadano, zona o tipo"
            value={filters.search}
            onChange={(e) => updateFilter('search', e.target.value)}
          />
        </label>

        <label className="reports-field">
          Estado
          <select value={filters.state} onChange={(e) => updateFilter('state', e.target.value as StateKey | '')}>
            <option value="">Todos</option>
            {STATES.map((state) => (
              <option key={state.key} value={state.key}>{state.label}</option>
            ))}
          </select>
        </label>

        {isAdmin && (
          <label className="reports-field">
            Zona
            <select value={filters.zone} onChange={(e) => updateFilter('zone', e.target.value)}>
              <option value="">Todas</option>
              {zoneOptions.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </label>
        )}

        <label className="reports-field">
          Tipo de trabajo
          <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)}>
            <option value="">Todos</option>
            {typeOptions.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>

        <label className="reports-field">
          Prioridad
          <select value={filters.priority} onChange={(e) => updateFilter('priority', e.target.value as Filters['priority'])}>
            <option value="">Todas</option>
            <option value="alta">Alta (peligro inmediato)</option>
            <option value="normal">Normal</option>
          </select>
        </label>

        <label className="reports-field">
          Veracidad
          <select value={filters.veracity} onChange={(e) => updateFilter('veracity', e.target.value as Veracity)}>
            <option value="">Todos</option>
            <option value="veridico">Verídicos</option>
            <option value="falso">Falsos (sospecha ≥ {FALSE_REPORT_THRESHOLD * 100}%)</option>
          </select>
        </label>

        <label className="reports-field">
          Desde
          <input
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => updateFilter('from', e.target.value)}
          />
        </label>

        <label className="reports-field">
          Hasta
          <input
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => updateFilter('to', e.target.value)}
          />
        </label>

        <label className="reports-field">
          Ordenar por
          <select value={filters.sort} onChange={(e) => updateFilter('sort', e.target.value as Sort)}>
            <option value="recientes">Más recientes</option>
            <option value="antiguos">Más antiguos</option>
            <option value="sospecha">Mayor sospecha</option>
            <option value="prioridad">Prioridad alta primero</option>
          </select>
        </label>

        <button type="button" className="reports-clear" disabled={!hasFilters} onClick={clearFilters}>
          Limpiar filtros
        </button>
      </section>

      <section ref={resultsRef} className="dashboard-panel reports-results" aria-label="Resultados">
        <p className="dashboard-muted reports-count" aria-live="polite">
          {loading
            ? 'Cargando reportes…'
            : filtered.length === 0
              ? reports.length === 0
                ? 'No hay reportes todavía.'
                : 'Ningún reporte coincide con los filtros.'
              : `Mostrando ${pageStart + 1}–${pageStart + pageReports.length} de ${filtered.length}` +
                (filtered.length !== reports.length ? ` (${reports.length} en total)` : '')}
        </p>

        {pageReports.length > 0 && (
          <>
          <ul className="reports-mobile-list" aria-label="Reportes encontrados">
            {pageReports.map((report) => <MobileReport key={report.folio} report={report} showZone={isAdmin} />)}
          </ul>
          <div className="reports-table-wrap">
            <table className="reports-table">
              <thead>
                <tr>
                  <th scope="col">Folio</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Descripción</th>
                  <th scope="col">Tipo de trabajo</th>
                  {isAdmin && <th scope="col">Zona</th>}
                  <th scope="col">Reportado por</th>
                  <th scope="col" className="reports-num">NNA</th>
                  <th scope="col" className="reports-num">Sospecha</th>
                  <th scope="col"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {pageReports.map((report) => {
                  const state = STATES.find((s) => s.key === normalizeState(report.last_state))!;
                  return (
                    <tr key={report.folio}>
                      <td className="reports-folio">{report.folio}</td>
                      <td className="reports-nowrap">{formatReportDate(report.created_at)}</td>
                      <td className="reports-nowrap">
                        <span className="reports-state">
                          <span className="reports-state-dot" style={{ background: state.color }} aria-hidden="true" />
                          {state.label}
                        </span>
                        {report.priority === 'alta' && <span className="reports-urgent">Prioridad alta</span>}
                        {report.duplicate_of && <span className="reports-duplicate">Duplicado de {report.duplicate_of}</span>}
                      </td>
                      <td>
                        <span className="reports-description" title={report.description}>{report.description || '—'}</span>
                      </td>
                      <td>{workTypeLabels(report.work_type).join(', ') || '—'}</td>
                      {isAdmin && <td>{report.zone_name || 'Sin zona'}</td>}
                      <td>{report.citizen_name || 'Anónimo'}</td>
                      <td className="reports-num">{quantityLabel(report.children_quantity)}</td>
                      <td
                        className={`reports-num${report.suspicius_level >= FALSE_REPORT_THRESHOLD ? ' reports-suspicious' : ''}`}
                      >
                        {formatSuspicion(report.suspicius_level)}
                      </td>
                      <td>
                        <Link
                          to={`/map?folio=${encodeURIComponent(report.folio)}`}
                          viewTransition
                          className="reports-open"
                        >
                          Ver en mapa
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {filtered.length > 0 && (
          <nav className="reports-pagination" aria-label="Paginación">
            <label className="reports-page-size">
              Por página
              <select
                value={pageSize}
                onChange={(e) => {
                  scrollToResultsRef.current = true;
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>

            <div className="reports-pages">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => changePage(currentPage - 1)}
                aria-label="Página anterior"
              >
              </button>
              {pageItems(currentPage, totalPages).map((item, i) =>
                item === '…' ? (
                  <span key={`gap-${i}`} className="reports-gap" aria-hidden="true">…</span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    className={item === currentPage ? 'is-current' : undefined}
                    aria-current={item === currentPage ? 'page' : undefined}
                    onClick={() => changePage(item)}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => changePage(currentPage + 1)}
                aria-label="Página siguiente"
              >
                ›
              </button>
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}

export default Reports;

function MobileReport({ report, showZone }: { report: Report; showZone: boolean }) {
  const state = STATES.find((item) => item.key === normalizeState(report.last_state))!;
  return (
    <li className="reports-mobile-item">
      <h2>{report.folio}</h2>
      <p className="reports-state"><span className="reports-state-dot" style={{ background: state.color }} aria-hidden="true" />{state.label}</p>
      <p className="dashboard-muted">{formatReportDate(report.created_at)}</p>
      {report.priority === 'alta' && <p className="reports-urgent">Prioridad alta</p>}
      <details>
        <summary>Ver detalles del reporte</summary>
        <p className="reports-mobile-description">{report.description || 'Sin descripción.'}</p>
        <dl>
          <div><dt>Tipo de trabajo</dt><dd>{workTypeLabels(report.work_type).join(', ') || 'Sin especificar'}</dd></div>
          {showZone && <div><dt>Zona</dt><dd>{report.zone_name || 'Sin zona'}</dd></div>}
          <div><dt>Reportado por</dt><dd>{report.citizen_name || 'Anónimo'}</dd></div>
          <div><dt>Niñas, niños y adolescentes</dt><dd>{quantityLabel(report.children_quantity)}</dd></div>
          <div><dt>Sospecha</dt><dd>{formatSuspicion(report.suspicius_level)}</dd></div>
          {report.duplicate_of && <div><dt>Duplicado de</dt><dd>{report.duplicate_of}</dd></div>}
        </dl>
      </details>
      <Link to={`/map?folio=${encodeURIComponent(report.folio)}`} className="sip-btn sip-btn--secondary">Ver en mapa</Link>
    </li>
  );
}
