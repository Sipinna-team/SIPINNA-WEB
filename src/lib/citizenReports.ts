import type { CitizenReport, PublicStatus } from './api';

/** Estados públicos del reporte. */
export const PUBLIC_REPORT_STEPS: { key: PublicStatus; label: string }[] = [
  { key: 'recibido', label: 'Recibido' },
  { key: 'en_revision', label: 'En revisión' },
  { key: 'canalizado', label: 'Canalizado' },
  { key: 'en_atencion', label: 'En atención' },
  { key: 'concluido', label: 'Concluido' },
];

export function publicStatusLabel(status: string) {
  return PUBLIC_REPORT_STEPS.find((step) => step.key === status)?.label ?? 'En revisión';
}

/** Oculta borradores y ordena por fecha. */
export function prepareCitizenReports(reports: CitizenReport[]) {
  return reports
    .filter((report) => report.report_state !== 'borrador' && report.report_state !== 'DRAFT')
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}

/** Filtra por folio y estado. */
export function filterCitizenReports(reports: CitizenReport[], folio = '', status = '') {
  const query = folio.trim().toUpperCase();
  return reports.filter((report) =>
    report.folio.toUpperCase().includes(query) && (!status || report.report_state === status),
  );
}
