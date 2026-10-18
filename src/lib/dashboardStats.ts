/** @file Cálculo de indicadores del dashboard y formatos de estados, fechas y duraciones. */

import type { Report } from './api';

/** Clave normalizada del estado de un reporte. */
export type StateKey =
  | 'registrado'
  | 'revision'
  | 'validado'
  | 'confirmado'
  | 'canalizado'
  | 'atencion'
  | 'seguimiento'
  | 'concluido'
  | 'archivado'
  | 'cancelado'
  | 'reincidente'
  | 'duplicado';

/**
 * Las etiquetas acompañan al color para identificar cada estado.
 * `value` es el valor técnico que manda y recibe el backend.
 */
export const STATES: { key: StateKey; value: string; label: string; color: string }[] = [
  { key: 'registrado', value: 'registrado', label: 'Reporte recibido', color: '#9a5b00' },
  { key: 'revision', value: 'en_revision', label: 'En revisión', color: '#65418d' },
  { key: 'validado', value: 'validado', label: 'Reporte validado', color: '#5b4a9e' },
  { key: 'confirmado', value: 'caso_confirmado', label: 'Caso confirmado', color: '#8a2f6b' },
  { key: 'canalizado', value: 'canalizado', label: 'Canalizado', color: '#24658e' },
  { key: 'atencion', value: 'en_atencion', label: 'En atención', color: '#1d6f73' },
  { key: 'seguimiento', value: 'en_seguimiento', label: 'En seguimiento', color: '#65418d' },
  { key: 'concluido', value: 'concluido', label: 'Concluido', color: '#167247' },
  { key: 'archivado', value: 'archivado', label: 'Archivado', color: '#595959' },
  { key: 'cancelado', value: 'cancelado', label: 'Cancelado', color: '#b42332' },
  { key: 'reincidente', value: 'reincidente', label: 'Reincidente', color: '#b21e70' },
  { key: 'duplicado', value: 'duplicado', label: 'Duplicado', color: '#7a7a7a' },
];

/** Estados que se muestran en la gráfica del dashboard */
const DASHBOARD_STATES: { key: StateKey; label: string; color: string }[] = [
  { key: 'registrado', label: 'Registrado', color: '#9a5b00' },
  { key: 'revision', label: 'En revisión', color: '#5b4a9e' },
  { key: 'seguimiento', label: 'En seguimiento', color: '#65418d' },
  { key: 'canalizado', label: 'Canalizado', color: '#24658e' },
  { key: 'concluido', label: 'Concluido', color: '#167247' },
  { key: 'archivado', label: 'Archivado', color: '#595959' },
  { key: 'cancelado', label: 'Cancelado', color: '#b42332' },
  { key: 'reincidente', label: 'Reincidente', color: '#b21e70' },
];

export function computeStaffStateSummary(byState: Record<StateKey, number>) {
  const segments = DASHBOARD_STATES.map((state) => ({
    label: state.label,
    color: state.color,
    value: byState[state.key],
  }));
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return { segments, total };
}

/** Estados de reportes verificados. */
const VERIFIED_STATES: StateKey[] = ['validado', 'confirmado', 'canalizado', 'atencion', 'seguimiento', 'concluido', 'reincidente'];
/** Estados de casos identificados. */
const CONFIRMED_STATES: StateKey[] = ['confirmado', 'canalizado', 'atencion', 'seguimiento', 'concluido'];

/** Rangos de edad del formulario RIETI. */
export const AGE_OPTIONS = ['0 a 5 años', '6 a 11 años', '12 a 14 años', '15 a 17 años', 'No sé'];
/** Rangos anteriores; se muestran cuando hay reportes que los usan. */
const LEGACY_AGE_RANGES = ['Menos de 5 años', '5 - 7 años', '8 - 10 años', '11 - 13 años', '14 - 17 años'];

/** Actividades del formulario RIETI. */
export const WORK_OPTIONS = [
  'Venta ambulante',
  'Limpieza de parabrisas',
  'Mendicidad',
  'Carga y descarga',
  'Trabajo en comercio',
  'Campo',
  'Construcción',
  'Trabajo doméstico',
  'Recolección de residuos',
  'Otra actividad',
  'No sé',
];

/** Opciones de riesgo. */
export const RISK_OPTIONS = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'no_se', label: 'No sé' },
] as const;

/** Etiqueta de riesgo; vacío si falta. */
export function riskLabel(risk: string) {
  return RISK_OPTIONS.find((option) => option.value === risk)?.label ?? '';
}

/** Texto de la cantidad de NNA: `null` = "No sé", 5 = "5 o más". */
export function quantityLabel(quantity: number | null) {
  if (quantity === null || quantity === undefined) return 'No sé';
  return quantity >= 5 ? '5 o más' : String(quantity);
}

/** Abreviaturas de los meses para los ejes de las gráficas. */
export const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/**
 * `suspicius_level` >= este valor se cuenta como reporte falso. El backend
 * devuelve 0 cuando el LLM aún no analiza el reporte, así que esos cuentan como verídicos.
 */
export const FALSE_REPORT_THRESHOLD = 0.5;

/** Modalidades de trabajo infantil acordadas con SIPINNA. */
const WORK_MODALITIES = [
  { label: 'Mendicidad forzada', match: 'mendicidad' },
  { label: 'Explotación sexual', match: 'sexual' },
  { label: 'Trata de personas', match: 'trata' },
  { label: 'Utilización para actividades ilícitas', match: 'ilicit' },
  { label: 'Trabajo peligroso', match: 'peligros' },
  { label: 'Otra situación de explotación y/o vulneración', match: 'otra situacion' },
];

const AGE_RANGES = [...AGE_OPTIONS, ...LEGACY_AGE_RANGES];

const UNATTENDED_AFTER_MS = 48 * 3_600_000;
const DAY_MS = 86_400_000;
/** Días previos a hoy que se promedian para decir si hoy es un día normal. */
const BASELINE_DAYS = 30;

/** Número de reportes de una zona. */
export type ZoneCount = { zone: string; count: number };
type LabelCount = { label: string; value: number };

/** Indicadores que muestra el dashboard; ver {@link computeDashboardStats}. */
export type DashboardStats = {
  total: number;
  today: number;
  /** Promedio de reportes por día en los `BASELINE_DAYS` anteriores a hoy. */
  dailyAverage: number;
  /** Siguen en "registrado" después de 48 h. */
  unattended: number;
  /** Promedio en milisegundos; `null` si no hay reportes con qué calcularlo. */
  avgFirstAttentionMs: number | null;
  /** Promedio en milisegundos; `null` si no hay reportes con qué calcularlo. */
  avgResolutionMs: number | null;
  /** Porcentajes 0-100; `null` si no hay reportes. */
  attendedPct: number | null;
  falsePct: number | null;
  repeatPct: number | null;
  byType: LabelCount[];
  byAge: LabelCount[];
  byState: Record<StateKey, number>;
  byZone: ZoneCount[];
  /** Los 6 reportes más recientes. */
  recent: Report[];
  /** Conteos por mes (enero a diciembre) del año en curso. */
  perMonth: number[];
  truthfulPerMonth: number[];
  falsePerMonth: number[];
  inReviewPerMonth: number[];
  completedPerMonth: number[];
  /** Indicadores de atención, sin duplicados. */
  funnel: { received: number; verified: number; confirmed: number; childrenCared: number };
  /** Reportes marcados como duplicado o posible duplicado. */
  duplicates: number;
  /** Reportes con peligro inmediato que siguen sin cerrarse. */
  openUrgent: number;
};

/**
 * Convierte un estado de texto libre en su {@link StateKey}. `historial_estados.estado` es texto libre;
 * se normaliza para agrupar variantes como "En revisión", "en_revision" o "REVISION".
 * @returns La clave del estado; `'registrado'` si no se reconoce.
 */
export function normalizeState(state: string | null | undefined): StateKey {
  const s = simplify(state);

  if (s.includes('reincid')) return 'reincidente';
  if (s.includes('duplic')) return 'duplicado';
  if (s.includes('confirm')) return 'confirmado';
  if (s.includes('validad')) return 'validado';
  if (s.includes('atencion')) return 'atencion';
  if (s.includes('cancel')) return 'cancelado';
  if (s.includes('archiv')) return 'archivado';
  if (s.includes('revision')) return 'revision';
  if (s.includes('seguimiento')) return 'seguimiento';
  if (s.includes('canaliz')) return 'canalizado';
  if (s.includes('conclu') || s.includes('complet') || s.includes('cerrad')) return 'concluido';
  return 'registrado';
}

/** Etiqueta legible de un estado de texto libre, p. ej. `"en_revision"` → `"En revisión"`. */
export function stateLabel(state: string | null | undefined): string {
  const key = normalizeState(state);
  return STATES.find((s) => s.key === key)!.label;
}

/** Quita acentos, mayúsculas y espacios repetidos para comparar textos. */
export function simplify(text: string | null | undefined) {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compara dos textos ignorando acentos, mayúsculas y espacios. */
function sameText(a: string, b: string | null | undefined) {
  return simplify(a).replace(/ /g, '') === simplify(b).replace(/ /g, '');
}

/**
 * Agrupa el texto libre en la modalidad de trabajo correspondiente o lo deja tal cual.
 * @returns La etiqueta, o `null` si el texto está vacío.
 */
export function workTypeLabel(type: string) {
  const text = simplify(type);
  if (!text) return null;
  const modality = WORK_MODALITIES.find((m) => text.includes(m.match));
  return modality?.label ?? type.trim();
}

/** Etiquetas de las modalidades separadas por coma; omite entradas vacías. */
export function workTypeLabels(types: string | null | undefined): string[] {
  return (types ?? '').split(',').map(workTypeLabel).filter((label): label is string => label !== null);
}

/** Promedio de los valores finitos y no negativos; `null` si no hay ninguno. */
function average(values: number[]) {
  const valid = values.filter((v) => Number.isFinite(v) && v >= 0);
  return valid.length > 0 ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
}

/** Indica si dos fechas caen en el mismo día local. */
function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Calcula todos los indicadores del dashboard en una sola pasada.
 * @param reports - Reportes visibles para el usuario.
 * @param now - Fecha de referencia para "hoy" y el año en curso.
 *
 * @remarks
 * - El tiempo de resolución usa el último cambio de estado de los reportes concluidos o canalizados.
 * - La app manda varias modalidades separadas por coma; cada una cuenta por separado.
 * - Las series mensuales solo incluyen el año en curso.
 */
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
    validado: 0,
    confirmado: 0,
    atencion: 0,
    duplicado: 0,
  };
  const funnel = { received: 0, verified: 0, confirmed: 0, childrenCared: 0 };
  let duplicates = 0;
  let openUrgent = 0;
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

    if (state === 'duplicado' || report.duplicate_of) {
      duplicates += 1;
    } else {
      funnel.received += 1;
      if (VERIFIED_STATES.includes(state)) funnel.verified += 1;
      if (CONFIRMED_STATES.includes(state)) funnel.confirmed += 1;
      funnel.childrenCared += report.children_cared ?? 0;
    }
    if (report.priority === 'alta' && !['concluido', 'archivado', 'cancelado', 'duplicado'].includes(state)) {
      openUrgent += 1;
    }

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
    if (state === 'concluido' || state === 'canalizado') {
      resolution.push(Date.parse(report.state_changed_at) - createdMs);
    }

    for (const type of (report.work_type ?? '').split(',')) {
      const label = workTypeLabel(type);
      if (label) types.set(label, (types.get(label) ?? 0) + 1);
    }

    const age = AGE_RANGES.find((range) => sameText(range, report.children_age)) ?? 'Sin especificar';
    ages.set(age, (ages.get(age) ?? 0) + 1);

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
      .filter(([label, value]) => AGE_OPTIONS.includes(label) || value > 0)
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
    funnel,
    duplicates,
    openUrgent,
  };
}

/** Punto con reportes recurrentes. */
export type Hotspot = {
  latitude: number;
  longitude: number;
  count: number;
  zone: string;
  /** Días más frecuentes. */
  days: string;
  /** Horario más frecuente. */
  hours: string;
  lastAt: string;
};

const WEEKDAYS = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];

/** Fecha del avistamiento o, si falta, de creación. */
export function sightingDate(report: Report) {
  const sighting = report.sighting_time ? new Date(report.sighting_time) : null;
  return sighting && !Number.isNaN(sighting.getTime()) ? sighting : new Date(report.created_at);
}

/**
 * Agrupa reportes en celdas de unos 100 m durante el periodo indicado.
 * Devuelve las de mayor frecuencia, sin cancelados ni duplicados.
 */
export function computeHotspots(reports: Report[], days = 90, minReports = 3, now = new Date()): Hotspot[] {
  const since = now.getTime() - days * DAY_MS;
  const cells = new Map<string, Report[]>();

  for (const report of reports) {
    const state = normalizeState(report.last_state);
    if (state === 'cancelado' || state === 'duplicado') continue;
    if (Date.parse(report.created_at) < since) continue;
    // 0.001° ≈ 110 m en el centro de México.
    const key = `${report.latitude.toFixed(3)},${report.longitude.toFixed(3)}`;
    const group = cells.get(key);
    if (group) group.push(report);
    else cells.set(key, [report]);
  }

  return [...cells.values()]
    .filter((group) => group.length >= minReports)
    .map((group) => {
      const dayCounts = Array<number>(7).fill(0);
      const hourCounts = Array<number>(24).fill(0);
      for (const report of group) {
        const date = sightingDate(report);
        dayCounts[date.getDay()] += 1;
        hourCounts[date.getHours()] += 1;
      }
      const topDays = dayCounts
        .map((count, day) => ({ count, day }))
        .filter((d) => d.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2)
        .map((d) => WEEKDAYS[d.day]);
      // Ventana de 4 horas con más reportes.
      let bestStart = 0;
      let bestCount = -1;
      for (let start = 0; start < 24; start += 1) {
        const count = [0, 1, 2, 3].reduce((sum, i) => sum + hourCounts[(start + i) % 24]!, 0);
        if (count > bestCount) {
          bestCount = count;
          bestStart = start;
        }
      }
      const pad = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;
      const latest = group.reduce((a, b) => (Date.parse(a.created_at) > Date.parse(b.created_at) ? a : b));
      return {
        latitude: group.reduce((sum, r) => sum + r.latitude, 0) / group.length,
        longitude: group.reduce((sum, r) => sum + r.longitude, 0) / group.length,
        count: group.length,
        zone: latest.zone_name || 'Sin zona',
        days: topDays.join(' y '),
        hours: `${pad(bestStart)} a ${pad(bestStart + 4)}`,
        lastAt: latest.created_at,
      };
    })
    .sort((a, b) => b.count - a.count);
}

/** Formatea una fecha como "Hoy", "Ayer", "Antier" o día y mes, seguido de la hora. */
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

/** Formatea una duración en minutos, horas o días; `"—"` si es `null`. */
export function formatDuration(ms: number | null) {
  if (ms === null) return '—';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} días`;
}
