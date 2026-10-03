import type { Report } from './api';

export type StateKey =
  | 'registrado'
  | 'revision'
  | 'seguimiento'
  | 'canalizado'
  | 'concluido'
  | 'archivado'
  | 'cancelado'
  | 'reincidente';

// Colores validados para daltonismo en este orden, incluido el par
// Reincidente→Registrado donde se cierra la dona. Si se reordena, hay que revalidar.
// value es el valor técnico que manda y recibe el backend.
export const STATES: { key: StateKey; value: string; label: string; color: string }[] = [
  { key: 'registrado', value: 'registrado', label: 'Registrado', color: '#2a78d6' },
  { key: 'revision', value: 'en_revision', label: 'En revisión', color: '#eb6834' },
  { key: 'seguimiento', value: 'en_seguimiento', label: 'En seguimiento', color: '#4a3aa7' },
  { key: 'canalizado', value: 'canalizado', label: 'Canalizado', color: '#1baf7a' },
  { key: 'concluido', value: 'concluido', label: 'Concluido', color: '#008300' },
  { key: 'archivado', value: 'archivado', label: 'Archivado', color: '#e87ba4' },
  { key: 'cancelado', value: 'cancelado', label: 'Cancelado', color: '#eda100' },
  { key: 'reincidente', value: 'reincidente', label: 'Reincidente', color: '#e34948' },
];

export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

// suspicius_level >= este valor se cuenta como reporte falso. El backend
// devuelve 0 cuando el LLM aún no analiza el reporte, así que esos cuentan como verídicos.
export const FALSE_REPORT_THRESHOLD = 0.5;

// Modalidades de trabajo infantil acordadas con SIPINNA
const WORK_MODALITIES = [
  { label: 'Mendicidad forzada', match: 'mendicidad' },
  { label: 'Explotación sexual', match: 'sexual' },
  { label: 'Trata de personas', match: 'trata' },
  { label: 'Utilización para actividades ilícitas', match: 'ilicit' },
  { label: 'Trabajo peligroso', match: 'peligros' },
  { label: 'Otra situación de explotación y/o vulneración', match: 'otra situacion' },
];

// Mismas opciones que la pantalla "Información del niño" de la app.
const AGE_RANGES = ['Menos de 5 años', '5 - 7 años', '8 - 10 años', '11 - 13 años', '14 - 17 años'];

const UNATTENDED_AFTER_MS = 48 * 3_600_000;
const DAY_MS = 86_400_000;
// Días previos a hoy que se promedian para decir si hoy es un día normal.
const BASELINE_DAYS = 30;

export type ZoneCount = { zone: string; count: number };
type LabelCount = { label: string; value: number };

export type DashboardStats = {
  total: number;
  today: number;
  // Promedio de reportes por día en los BASELINE_DAYS anteriores a hoy.
  dailyAverage: number;
  // Siguen en "registrado" después de 48 h.
  unattended: number;
  // Promedios en milisegundos; null si no hay reportes con qué calcularlos.
  avgFirstAttentionMs: number | null;
  avgResolutionMs: number | null;
  // Porcentajes 0-100; null si no hay reportes.
  attendedPct: number | null;
  falsePct: number | null;
  repeatPct: number | null;
  byType: LabelCount[];
  byAge: LabelCount[];
  byState: Record<StateKey, number>;
  byZone: ZoneCount[];
  recent: Report[];
  perMonth: number[];
  truthfulPerMonth: number[];
  falsePerMonth: number[];
  inReviewPerMonth: number[];
  completedPerMonth: number[];
};

// historial_estados.estado es texto libre; se normaliza para agrupar variantes
// como "En revisión", "en_revision" o "REVISION".
export function normalizeState(state: string | null | undefined): StateKey {
  const s = simplify(state);

  if (s.includes('reincid')) return 'reincidente';
  if (s.includes('cancel')) return 'cancelado';
  if (s.includes('archiv')) return 'archivado';
  if (s.includes('revision')) return 'revision';
  if (s.includes('seguimiento')) return 'seguimiento';
  if (s.includes('canaliz')) return 'canalizado';
  if (s.includes('conclu') || s.includes('complet') || s.includes('cerrad')) return 'concluido';
  return 'registrado';
}

export function stateLabel(state: string | null | undefined): string {
  const key = normalizeState(state);
  return STATES.find((s) => s.key === key)!.label;
}

export function simplify(text: string | null | undefined) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function sameText(a: string, b: string | null | undefined) {
  return simplify(a).replace(/ /g, '') === simplify(b).replace(/ /g, '');
}

// Agrupa el texto libre en la modalidad correspondiente o lo deja tal cual.
export function workTypeLabel(type: string) {
  const text = simplify(type);
  if (!text) return null;
  const modality = WORK_MODALITIES.find((m) => text.includes(m.match));
  return modality?.label ?? type.trim();
}

function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v) && v >= 0);
  return valid.length > 0 ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function computeDashboardStats(reports: Report[], now = new Date()): DashboardStats {
  const byState: Record<StateKey, number> = {
    registrado: 0,
    revision: 0,
    seguimiento: 0,
    canalizado: 0,
    concluido: 0,
    archivado: 0,
    cancelado: 0,
    reincidente: 0,
  };
  const zones = new Map<string, number>();
  const emptyYear = () => Array<number>(12).fill(0);
  const perMonth = emptyYear();
  const truthfulPerMonth = emptyYear();
  const falsePerMonth = emptyYear();
  const inReviewPerMonth = emptyYear();
  const completedPerMonth = emptyYear();
  let today = 0;
  let baseline = 0;
  let unattended = 0;
  let falseCount = 0;
  const firstAttention: number[] = [];
  const resolution: number[] = [];
  const types = new Map<string, number>();
  const ages = new Map<string, number>(AGE_RANGES.map((range) => [range, 0]));
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  for (const report of reports) {
    const state = normalizeState(report.last_state);
    byState[state] += 1;

    const zoneName = report.zone_name || 'Sin zona';
    zones.set(zoneName, (zones.get(zoneName) ?? 0) + 1);

    const createdAt = new Date(report.created_at);
    const createdMs = createdAt.getTime();
    if (isSameDay(createdAt, now)) today += 1;
    else if (createdMs < startOfToday && createdMs >= startOfToday - BASELINE_DAYS * DAY_MS) baseline += 1;

    if (state === 'registrado' && now.getTime() - createdMs > UNATTENDED_AFTER_MS) unattended += 1;
    if (report.suspicius_level >= FALSE_REPORT_THRESHOLD) falseCount += 1;

    if (report.first_attention_at) {
      firstAttention.push(Date.parse(report.first_attention_at) - createdMs);
    }
    // El último cambio de estado de un reporte concluido o canalizado es cuando se cerró.
    if (state === 'concluido' || state === 'canalizado') {
      resolution.push(Date.parse(report.state_changed_at) - createdMs);
    }

    // La app manda varias opciones separadas por coma; cada una cuenta por separado.
    for (const type of (report.work_type ?? '').split(',')) {
      const label = workTypeLabel(type);
      if (label) types.set(label, (types.get(label) ?? 0) + 1);
    }

    const age = AGE_RANGES.find((range) => sameText(range, report.children_age)) ?? 'Sin especificar';
    ages.set(age, (ages.get(age) ?? 0) + 1);

    // Las gráficas mensuales solo muestran el año en curso.
    if (createdAt.getFullYear() !== now.getFullYear()) continue;
    const month = createdAt.getMonth();
    perMonth[month] += 1;
    if (report.suspicius_level >= FALSE_REPORT_THRESHOLD) falsePerMonth[month] += 1;
    else truthfulPerMonth[month] += 1;
    if (state === 'revision') inReviewPerMonth[month] += 1;
    if (state === 'concluido') completedPerMonth[month] += 1;
  }

  const byZone = [...zones.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count);

  const pct = (count: number) => (reports.length > 0 ? (count / reports.length) * 100 : null);

  return {
    total: reports.length,
    today,
    dailyAverage: baseline / BASELINE_DAYS,
    unattended,
    avgFirstAttentionMs: average(firstAttention),
    avgResolutionMs: average(resolution),
    attendedPct: pct(byState.concluido + byState.canalizado),
    falsePct: pct(falseCount),
    repeatPct: pct(byState.reincidente),
    byType: [...types.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    byAge: [...ages.entries()]
      .filter(([label, value]) => label !== 'Sin especificar' || value > 0)
      .map(([label, value]) => ({ label, value })),
    byState,
    byZone,
    recent: [...reports]
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 6),
    perMonth,
    truthfulPerMonth,
    falsePerMonth,
    inReviewPerMonth,
    completedPerMonth,
  };
}

export function formatCoordinates(latitude: number, longitude: number) {
  const lat = `${Math.abs(latitude).toFixed(4)}${latitude >= 0 ? 'N' : 'S'}`;
  const lng = `${Math.abs(longitude).toFixed(4)}${longitude >= 0 ? 'E' : 'W'}`;
  return `${lat}, ${lng}`;
}

export function formatRelativeDate(value: string, now = new Date()) {
  const date = new Date(value);
  const time = date.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000);

  if (days === 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  if (days === 2) return `Antier, ${time}`;
  return `${date.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ${time}`;
}

export function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}
