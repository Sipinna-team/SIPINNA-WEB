import type { LogEntry } from './api';

/** Describe la operación solicitada; el resultado indica si pudo realizarse. */
export function describeAuditAction(entry: Pick<LogEntry, 'method' | 'path'>) {
  const method = entry.method.toUpperCase();
  const parts = entry.path.split('/').filter(Boolean);
  const [section, reference, operation] = parts;

  if (section === 'admin' && reference === 'staff') {
    const resource = parts[2] ? `Cuenta: ${parts[2]}` : 'Personal';
    if (parts.length === 2 && method === 'GET') return { action: 'Consultar la lista de personal', resource };
    if (parts.length === 2 && method === 'POST') return { action: 'Crear una cuenta de personal', resource };
    if (parts.length === 3 && method === 'PATCH') return { action: 'Actualizar rol, zona o estado de una cuenta', resource };
    if (parts.length === 4 && parts[3] === 'invitation' && method === 'POST') return { action: 'Reenviar una invitación', resource };
  }

  if (entry.path === '/admin/bitacora' && method === 'GET') {
    return { action: 'Consultar la bitácora', resource: 'Bitácora de accesos y actividad' };
  }

  if (section === 'report') {
    if (parts.length === 1 && method === 'GET') return { action: 'Consultar reportes propios', resource: 'Reportes' };
    if (parts.length === 1 && method === 'POST') return { action: 'Crear un reporte', resource: 'Reportes' };
    if (parts.length === 2 && reference === 'all' && method === 'GET') return { action: 'Consultar la lista de reportes', resource: 'Reportes' };
    if (parts.length === 3 && reference === 'zone' && method === 'GET') return { action: 'Consultar reportes de una zona', resource: `Zona: ${operation}` };

    const resource = reference ? `Reporte: ${reference}` : 'Reportes';
    if (parts.length === 2 && method === 'GET') return { action: 'Consultar un reporte y su expediente', resource };
    if (parts.length === 2 && method === 'DELETE') return { action: 'Eliminar un reporte', resource };
    if (parts.length === 3) {
      const actions: Record<string, string> = {
        'PATCH status': 'Cambiar el estado de un reporte',
        'PATCH expediente': 'Actualizar el expediente interno',
        'PATCH assignment': 'Actualizar la asignación de un reporte',
        'PATCH case': 'Actualizar el caso asociado a un reporte',
        'GET acciones': 'Consultar el seguimiento de un reporte',
        'POST acciones': 'Registrar una acción de seguimiento',
        'POST images': 'Registrar fotografías de un reporte',
        'PUT submit': 'Enviar un reporte',
      };
      const action = actions[`${method} ${operation}`];
      if (action) return { action, resource };
    }
    if (parts.length === 4 && operation === 'images' && method === 'PUT') return { action: 'Subir una fotografía', resource };
  }

  if (entry.path === '/cases') {
    if (method === 'GET') return { action: 'Consultar la lista de casos', resource: 'Casos' };
    if (method === 'POST') return { action: 'Crear un caso', resource: 'Casos' };
  }

  // Una ruta nueva no debe recibir una descripción que pueda ser incorrecta.
  return { action: 'Operación sin descripción disponible', resource: 'Consultar el detalle técnico' };
}

export function describeAuditResult(status: number, method: string) {
  if (status >= 200 && status < 300) return method.toUpperCase() === 'GET' ? 'Consulta exitosa' : 'Operación realizada';
  if (status === 401) return 'Sesión no válida';
  if (status === 403) return 'Acceso denegado';
  if (status === 404) return 'Recurso no encontrado';
  if (status === 409) return 'Conflicto con los datos actuales';
  if (status === 400 || status === 422) return 'Solicitud no válida';
  if (status === 429) return 'Demasiadas solicitudes';
  if (status >= 500) return 'Error del servidor';
  if (status >= 300 && status < 400) return 'Redirección';
  return 'Operación no completada';
}
