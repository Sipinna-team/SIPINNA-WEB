import type { Report } from './api';
import { stateLabel } from './dashboardStats';

/** @file Exportación de reportes a CSV y PDF, y formatos compartidos para mostrarlos. */

const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Formatea una fecha ISO en estilo corto es-MX.
 * @returns La fecha formateada; el texto original (o "—") si no es válida.
 */
export function formatReportDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value || '—' : dateFormatter.format(date);
}

/** Convierte `suspicius_level` (de 0 a 1) en porcentaje. */
export const formatSuspicion = (level: number) => `${Math.round(level * 100)}%`;

type Column = { header: string; value: (report: Report) => string | number };

const COLUMNS: Column[] = [
  { header: 'Folio', value: (r) => r.folio },
  { header: 'Fecha', value: (r) => formatReportDate(r.created_at) },
  { header: 'Estado', value: (r) => stateLabel(r.last_state) },
  { header: 'Descripción', value: (r) => r.description },
  { header: 'Tipo de trabajo', value: (r) => r.work_type },
  { header: 'Zona', value: (r) => r.zone_name || 'Sin zona' },
  { header: 'Reportado por', value: (r) => r.citizen_name || 'Anónimo' },
  { header: 'NNA', value: (r) => r.children_quantity },
  { header: 'Edades', value: (r) => r.children_age },
  { header: 'Sospecha', value: (r) => formatSuspicion(r.suspicius_level) },
  { header: 'Latitud', value: (r) => r.latitude },
  { header: 'Longitud', value: (r) => r.longitude },
  { header: 'Último cambio de estado', value: (r) => formatReportDate(r.state_changed_at) },
];

/** La descripción y las coordenadas no caben en una hoja horizontal. */
const PDF_HEADERS = ['Folio', 'Fecha', 'Estado', 'Tipo de trabajo', 'Zona', 'Reportado por', 'NNA', 'Edades', 'Sospecha'];
const PDF_COLUMNS = COLUMNS.filter((c) => PDF_HEADERS.includes(c.header));

/** Nombre de archivo con la fecha de hoy, p. ej. `reportes-sipinna-2026-10-10.csv`. */
function fileName(extension: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `reportes-sipinna-${today}.${extension}`;
}

/** Descarga un Blob en el navegador con el nombre indicado. */
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Escapa una celda CSV (comillas, comas y saltos de línea). */
function csvCell(value: string | number) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Descarga los reportes como CSV con todas las columnas. Incluye BOM para que Excel lo abra
 * como UTF-8 y respete los acentos.
 * @param reports - Reportes a exportar.
 */
export function exportReportsCsv(reports: Report[]) {
  const rows = [
    COLUMNS.map((c) => c.header),
    ...reports.map((report) => COLUMNS.map((c) => c.value(report))),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), fileName('csv'));
}

/**
 * Descarga los reportes como PDF horizontal. jsPDF pesa bastante; solo se descarga cuando alguien exporta.
 * @param reports - Reportes a exportar.
 * @param filtersSummary - Texto de los filtros aplicados, impreso bajo el título.
 */
export async function exportReportsPdf(reports: Report[], filtersSummary: string) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });

  doc.setFontSize(16);
  doc.setTextColor('#611232');
  doc.text('Reportes SIPINNA', 40, 40);
  doc.setFontSize(9);
  doc.setTextColor('#5c6166');
  doc.text(`Generado el ${formatReportDate(new Date().toISOString())} · ${reports.length} reportes`, 40, 56);
  doc.text(doc.splitTextToSize(filtersSummary, 712), 40, 70);

  autoTable(doc, {
    startY: 90,
    head: [PDF_COLUMNS.map((c) => c.header)],
    body: reports.map((report) => PDF_COLUMNS.map((c) => c.value(report))),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: '#9b2247', textColor: '#ffffff' },
    alternateRowStyles: { fillColor: '#faf6ec' },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize;
      doc.setFontSize(8);
      doc.setTextColor('#5c6166');
      doc.text(`Página ${doc.getNumberOfPages()}`, pageSize.getWidth() - 40, pageSize.getHeight() - 20, {
        align: 'right',
      });
    },
  });

  doc.save(fileName('pdf'));
}
