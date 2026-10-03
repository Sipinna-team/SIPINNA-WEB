import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type { Report, UserType } from '../lib/api';
import type { ZoneCount } from '../lib/dashboardStats';
import {MONTHS,STATES,computeDashboardStats,formatDuration,formatRelativeDate,} from '../lib/dashboardStats';
import {AnimatedNumber,ColumnChart,DonutChart,HorizontalBarChart,LineChart,} from '../components/DashboardCharts';
import { KpiCarousel } from '../components/KpiCarousel';
import { ReportMapLink } from '../components/ReportAddress';
import { ZoomablePanel } from '../components/ZoomablePanel';

const USER_TYPE_LABELS: Record<UserType, string> = {
  administrador: 'Administrador',
  alimentador: 'Alimentador',
  citizen: 'Ciudadano',
};
// Nombre del municipio o UUID de la zona. Vite solo la lee al arrancar.
const REPORTS_ZONE: string | undefined = import.meta.env.VITE_REPORTS_ZONE?.trim() || undefined;
const MONTH_NUMBERS =MONTHS.map((_, i) => String(i + 1));
const MAP_PREVIEW_URL =
  'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/-99.2734,19.5645,11.5,0/400x200@2x' +
  `?access_token=${import.meta.env.VITE_MAP_BOX_TOKEN}`;

const ZONE_LIST_SIZE = 5;

const toBars = (zones: ZoneCount[]) =>
  zones.map((z) => ({ label: z.zone, value: z.count }));

type KpiTileProps = {
  title: string;
  value: ReactNode;
  hint: string;
  tone?: 'good' | 'warn';
  badge?: { text: string; tone: 'up' | 'down' };
};

function KpiTile({ title, value, hint, tone, badge }: KpiTileProps) {
  return (
    <article className={`dashboard-panel dashboard-tile${tone ? ` dashboard-tile--${tone}` : ''}`}>
      <h2 className="dashboard-tile-title">{title}</h2>
      <p className="dashboard-tile-value">
        {value}
        {badge && <span className={`dashboard-tile-badge dashboard-tile-badge--${badge.tone}`}>{badge.text}</span>}
      </p>
      <p className="dashboard-muted dashboard-tile-hint">{hint}</p>
    </article>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}

function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const userTypeLabel = user ? USER_TYPE_LABELS[user.userType] ?? user.userType : '';
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abortController = new AbortController();

    // VITE_REPORTS_ZONE se piden todas las zonas se usa el endpoint GET /report/all
    const request = REPORTS_ZONE
      ? api.getReportsByZone(REPORTS_ZONE, abortController.signal)
      : api.getAllReports(abortController.signal);

    request
      // Go serializa un slice vacío como null.
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

  const stats = useMemo(() => computeDashboardStats(reports), [reports]);
  const placeholder = loading ? '…' : '—';

  async function handleLogout() {
    try {
      await logout();
    } catch (err) {
      console.error('Error al cerrar sesión', err);
    } finally {
      navigate('/login', { replace: true, viewTransition: true });
    }
  }

  const pctTile = (value: number | null) =>
    value === null ? placeholder : <><AnimatedNumber value={Math.round(value)} />%</>;
  const todayTrend =
    stats.dailyAverage > 0 ? Math.round(((stats.today - stats.dailyAverage) / stats.dailyAverage) * 100) : null;
  const zonesSplit = stats.byZone.length > ZONE_LIST_SIZE;
  // Solo los administradores ven todas las zonas un alimentador solo tiene la suya.
  const isAdmin = user?.userType === 'administrador';
  const showZones = isAdmin;

  return (
    <main className="dashboard-page" aria-label="Panel de control">
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      <div className={`dashboard-grid${showZones ? '' : ' dashboard-grid--no-zones'}`}>
        <KpiCarousel className="dashboard-kpis" label="Indicadores">
          <KpiTile
            title="Reportes de hoy"
            value={loading ? placeholder : <AnimatedNumber value={stats.today} />}
            hint={`Promedio diario: ${stats.dailyAverage.toFixed(1)}`}
            badge={
              !loading && todayTrend !== null
                ? { text: `${todayTrend > 0 ? '+' : ''}${todayTrend}%`, tone: todayTrend > 0 ? 'up' : 'down' }
                : undefined
            }
          />
          <KpiTile
            title="Sin atender +48 h"
            value={loading ? placeholder : <AnimatedNumber value={stats.unattended} />}
            hint="Siguen en registrado"
            tone={stats.unattended > 0 ? 'warn' : undefined}
          />
          <KpiTile
            title="Primera atención"
            value={loading ? placeholder : formatDuration(stats.avgFirstAttentionMs)}
            hint={stats.avgFirstAttentionMs === null ? 'Pendiente: requiere historial en la API' : 'Promedio hasta empezar a revisar'}
          />
          <KpiTile
            title="Tiempo de resolución"
            value={loading ? placeholder : formatDuration(stats.avgResolutionMs)}
            hint="Promedio hasta concluir o canalizar"
          />
          <KpiTile
            title="Atendidos"
            value={loading ? placeholder : pctTile(stats.attendedPct)}
            hint={`${stats.byState.concluido + stats.byState.canalizado} de ${stats.total} concluidos o canalizados`}
            tone="good"
          />
          <KpiTile
            title="Reportes falsos"
            value={loading ? placeholder : pctTile(stats.falsePct)}
            hint="Nivel de sospecha de 50% o más"
          />
          <KpiTile
            title="Reportes repetidos"
            value={loading ? placeholder : pctTile(stats.repeatPct)}
            hint={`${stats.byState.reincidente} marcados como reincidentes`}
          />
          <KpiTile
            title="Total de reportes"
            value={loading ? placeholder : <AnimatedNumber value={stats.total} />}
            hint={
              REPORTS_ZONE
                ? `Zona ${REPORTS_ZONE}`
                : !isAdmin && user?.zoneName
                  ? `Zona ${user.zoneName}`
                  : 'Todas las zonas'
            }
          />
        </KpiCarousel>

        <section className="dashboard-panel dashboard-profile" aria-label="Usuario">
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="dashboard-avatar"
            role="img"
            aria-label={`Foto de ${user?.name || 'usuario'}`}
          >
            <circle cx="12" cy="9" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0Z" />
          </svg>
          <div className="dashboard-user-info">
            <span className="dashboard-user-type">{userTypeLabel}</span>
            <strong>{user?.name}</strong>
            {/* El administrador ve todas las zonas, el alimentador ve solo su zona asignada. */}
            {!isAdmin && (
              <span className="dashboard-user-zone">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" />
                  <circle cx="12" cy="9.5" r="2.5" />
                </svg>
                {user?.zoneName || 'Sin zona asignada'}
              </span>
            )}
          </div>
          <button
            className="dashboard-logout"
            type="button"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h12" />
            </svg>
          </button>
        </section>

        <Link
          to="/map"
          viewTransition
          className="dashboard-panel dashboard-panel--shortcut dashboard-map-link"
          style={{ backgroundImage: `url(${MAP_PREVIEW_URL})` }}
        >
          <span>
            Mapa
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
            </svg>
          </span>
        </Link>

        <ZoomablePanel className="dashboard-panel--overview" aria-labelledby="kpi-states">
          <h2 id="kpi-states" className="dashboard-title">Reportes por estado</h2>
          <DonutChart
            segments={STATES.map((state) => ({
              label: state.label,
              value: stats.byState[state.key],
              color: state.color,
            }))}
            centerValue={stats.byState.concluido}
            centerLabel="concluidos"
          />
        </ZoomablePanel>

        <ZoomablePanel className="dashboard-panel--types" aria-labelledby="kpi-types">
          <h2 id="kpi-types" className="dashboard-subtitle">Reportes por tipo</h2>
          <span className="dashboard-muted">Un reporte puede tener varios tipos</span>
          {!loading && stats.byType.length === 0 && <p className="dashboard-muted">Sin datos todavía.</p>}
          <HorizontalBarChart items={stats.byType.slice(0, 6)} />
        </ZoomablePanel>

        <ZoomablePanel className="dashboard-panel--ages" aria-labelledby="kpi-ages">
          <h2 id="kpi-ages" className="dashboard-subtitle">Edades de niñas, niños y adolescentes en los reportes</h2>
          <HorizontalBarChart items={loading ? [] : stats.byAge} />
        </ZoomablePanel>

        {showZones && (
          <ZoomablePanel className="dashboard-panel--zones" aria-labelledby="kpi-zones">
            <h2 id="kpi-zones" className="dashboard-subtitle">Zonas con más y menos reportes</h2>
            {!loading && stats.byZone.length === 0 && <p className="dashboard-muted">Sin datos todavía.</p>}
            <div className="dashboard-zones">
              <div>
                {zonesSplit && <h3 className="dashboard-muted">Más reportes</h3>}
                <HorizontalBarChart items={toBars(stats.byZone.slice(0, ZONE_LIST_SIZE))} />
              </div>
              {zonesSplit && (
                <div>
                  <h3 className="dashboard-muted">Menos reportes</h3>
                  <HorizontalBarChart items={toBars(stats.byZone.slice(-ZONE_LIST_SIZE).reverse())} />
                </div>
              )}
            </div>
          </ZoomablePanel>
        )}

        <ZoomablePanel className="dashboard-panel--recent" aria-labelledby="kpi-recent">
          <div className="dashboard-panel-header">
            <h2 id="kpi-recent" className="dashboard-subtitle">Reportes recientes</h2>
            {/* stopPropagation: el clic no debe abrir también el panel ampliado. */}
            <Link
              to="/reports"
              viewTransition
              className="dashboard-see-all"
              onClick={(event) => event.stopPropagation()}
            >
              Ver todos
            </Link>
          </div>
          {!loading && stats.recent.length === 0 && (
            <p className="dashboard-muted">No hay reportes todavía.</p>
          )}
          <ul className="dashboard-recent">
            {stats.recent.map((report) => (
              <li key={report.folio}>
                <span className="dashboard-recent-avatar" aria-hidden="true">
                  {initials(report.citizen_name || '?')}
                </span>
                <span className="dashboard-recent-who">
                  <strong>{report.citizen_name || 'Anónimo'}</strong>
                  <span className="dashboard-muted">{formatRelativeDate(report.created_at)}</span>
                </span>
                <ReportMapLink
                  className="dashboard-recent-coords"
                  latitude={report.latitude}
                  longitude={report.longitude}
                />
              </li>
            ))}
          </ul>
        </ZoomablePanel>

        <ZoomablePanel className="dashboard-panel--featured dashboard-charts" aria-label="Tendencias del año">
          <div>
            <h2 className="dashboard-subtitle">Número de reportes por mes</h2>
            <ColumnChart
              label="Reportes por mes"
              categories={MONTHS}
              series={[{ label: 'Reportes', color: '#9b2247', values: stats.perMonth }]}
            />
          </div>
          <div>
            <h2 className="dashboard-subtitle">Reportes verídicos / reportes falsos</h2>
            <ColumnChart
              label="Reportes verídicos y falsos por mes"
              categories={MONTH_NUMBERS}
              series={[
                { label: 'Verídicos', color: '#9b2247', values: stats.truthfulPerMonth },
                { label: 'Falsos', color: '#a57f2c', values: stats.falsePerMonth },
              ]}
            />
          </div>
          <div>
            <h2 className="dashboard-subtitle">Reportes en revisión / completados</h2>
            <LineChart
              label="Reportes en revisión y completados por mes"
              categories={MONTH_NUMBERS}
              series={[
                { label: 'En revisión', color: '#9b2247', values: stats.inReviewPerMonth },
                { label: 'Completados', color: '#a57f2c', values: stats.completedPerMonth },
              ]}
            />
          </div>
        </ZoomablePanel>
      </div>
    </main>
  );
}

export default Dashboard;