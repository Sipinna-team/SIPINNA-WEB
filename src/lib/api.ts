/**
 * @file Cliente HTTP del backend de SIPINNA: tipos de las respuestas y los
 * payloads, y el objeto {@link api} con un método por endpoint.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL;

/** Credenciales de inicio de sesión. Solo uno de `email`/`number` va lleno; el otro se manda explícitamente como `null`. */
export type LoginPayload = {
  email: string | null;
  number: string | null;
  password: string;
};

/** Datos para registrar una cuenta de ciudadano. */
export type RegisterCitizenPayload = {
  nombre: string;
  edad: number;
  genero: string;
  email: string;
  telefono: string;
  password: string;
};

export type AccountProfile = {
  nombre: string;
  email: string | null;
  telefono: string | null;
  edad: number;
  genero: string;
  user_type: UserType;
  zone_name: string;
  has_password: boolean;
};

export type UpdateProfilePayload = Omit<RegisterCitizenPayload, 'password'>;

/** Solicitud de código de recuperación. Igual que en login: solo uno de `email`/`number` va lleno, el otro en `null`. */
export type ForgotPasswordPayload = {
  email: string | null;
  number: string | null;
};

/** Restablecimiento de contraseña con el código recibido. */
export type ResetPasswordPayload = ForgotPasswordPayload & {
  code: string;
  new_password: string;
};

/** Tipo de usuario. Viene del rol en la tabla `admins`; si el usuario no es staff es `'citizen'`. */
export type UserType = 'administrador' | 'alimentador' | 'citizen';

/** Sesión activa que devuelven los endpoints de autenticación. */
export type SessionResponse = {
  name: string;
  user_type: UserType;
  /** Vacío para ciudadanos o staff sin zona asignada. */
  zone_name: string;
};

/** Reporte que devuelven `GET /report/all` y `GET /report/zone/:zone_id` (solo staff). */
export type Report = {
  folio: string;
  description: string;
  latitude: number;
  longitude: number;
  children_quantity: number;
  work_type: string;
  created_at: string;
  /** Nivel de sospecha de 0 a 1. */
  suspicius_level: number;
  children_age: string;
  zone_name: string;
  citizen_name: string;
  last_state: string;
  state_changed_at: string;
  first_attention_at?: string | null;
  /** Caso al que pertenece el reporte; `null`/ausente si no está en ninguno. */
  case_id?: string | null;
  case_name?: string | null;
};

/** Caso: agrupa reportes que describen la misma situación en el mismo lugar. */
export type Case = {
  id: string;
  name: string;
  zone_id: string | null;
  report_count: number;
  created_at: string;
};

/** Zona de atención. `latitude`/`longitude` son `null` si la zona no tiene coordenadas en la BD. */
export type Zone = {
  id: string;
  name: string;
  municipio: string;
  latitude: number | null;
  longitude: number | null;
};

/** Rol de una cuenta de staff. */
export type AdminRole = 'administrador' | 'alimentador';
/** Estado de activación de una cuenta de staff. */
export type AccountState = 'activada' | 'pendiente';

/** Cuenta de staff (administradores y alimentadores) gestionada desde el dashboard. */
export type StaffMember = {
  id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  rol: AdminRole;
  zona_id: string | null;
  zona_nombre: string;
  estado_cuenta: AccountState;
  /** `true` mientras la cuenta no acepta su invitación; una cuenta suspendida también está `'pendiente'`, pero con esto en `false`. */
  invitacion_pendiente: boolean;
  created_at: string;
};

/** Datos para crear una cuenta de staff. La cuenta nace pendiente y se le envía la invitación a `email`. */
export type CreateStaffPayload = {
  nombre: string;
  rol: AdminRole;
  zona_id: string | null;
  email: string;
  telefono: string;
};

/** Datos de una invitación de staff, de `POST /auth/invitation`. */
export type Invitation = {
  nombre: string;
  email: string | null;
  rol: AdminRole;
  zona_nombre: string;
};

/** Cambios parciales a una cuenta de staff; los campos omitidos no se modifican. */
export type UpdateStaffPayload = {
  rol?: AdminRole;
  zona_id?: string;
  estado_cuenta?: AccountState;
};

/** Reporte con hora del avistamiento e imágenes, de `GET /report/:folio`. */
export type ReportDetail = Report & {
  sighting_time: string;
  images: string[];
};

/** Cuerpo de `POST /report`. La condición y la dirección van dentro de `description`. */
export type CreateReportPayload = {
  description: string;
  latitude: number;
  longitude: number;
  children_quantity: number;
  children_age: string;
  /** Varias opciones separadas por coma. */
  work_type: string;
  /** Hora local, `"YYYY-MM-DDTHH:mm"`. */
  sighting_time: string;
};

const DEFAULT_TIMEOUT_MS = 8000;

/** Header con el que un reporte anónimo demuestra que es de quien lo creó. */
const editTokenHeader = (editToken?: string): Record<string, string> =>
  editToken ? { 'X-Edit-Token': editToken } : {};
type RequestOptions = RequestInit & { timeoutMs?: number };

/**
 * Hace una petición JSON al backend con la cookie de sesión.
 *
 * @typeParam T - Tipo del cuerpo de respuesta.
 * @param path - Ruta relativa a `VITE_API_URL`.
 * @param options - Opciones de `fetch` más `timeoutMs` (8 s por defecto).
 * @returns El cuerpo de la respuesta ya parseado.
 * @throws {Error} Con el mensaje del backend si la respuesta no es 2xx, o uno
 * de tiempo agotado si la API no responde a tiempo.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options;

  /** Aborta si la API no responde a tiempo. */
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener('abort', onExternalAbort);

  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      credentials: 'include',
      // Con FormData el navegador pone el Content-Type multipart con su boundary.
      headers: {
        ...(fetchOptions.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...fetchOptions.headers,
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error ?? data?.message ?? `Error ${response.status}`);
    }

    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error('El servidor no respondió a tiempo. Intenta de nuevo más tarde.', { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Métodos del backend. Todos rechazan con `Error` si la petición falla (ver {@link request}).
 *
 * @remarks Las listas pueden llegar como `null` porque Go serializa un slice vacío así;
 * quien las consume debe usar `?? []`.
 */
export const api = {
  /** Inicia sesión con correo o teléfono; el backend deja la cookie de sesión. */
  login(payload: LoginPayload) {
    return request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Canjea el access_token de Supabase (login con Google) por la cookie de sesión.
   * @param accessToken - Token de la sesión de Supabase.
   */
  loginWithGoogle(accessToken: string) {
    return request<SessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    });
  },

  /** Devuelve la sesión actual; falla si no hay cookie válida. */
  me() {
    return request<SessionResponse>('/auth/me');
  },

  getProfile(signal?: AbortSignal) {
    return request<AccountProfile>('/account', { signal });
  },

  updateProfile(payload: UpdateProfilePayload) {
    return request<AccountProfile>('/account', { method: 'PUT', body: JSON.stringify(payload) });
  },

  deleteAccount(confirmation: string) {
    return request<unknown>('/account', { method: 'DELETE', body: JSON.stringify({ confirmation }) });
  },

  /** Cierra la sesión y borra la cookie. */
  logout() {
    return request<unknown>('/auth/logout', { method: 'POST' });
  },

  /** Registra una cuenta de ciudadano. */
  registerCitizen(payload: RegisterCitizenPayload) {
    return request<unknown>('/auth/citizen', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Cambia el estado de un reporte.
   * @param folio - Folio del reporte.
   * @param estado - Nuevo estado.
   * @param motivo - Obligatorio para cancelado, archivado y reincidente.
   */
  updateReportStatus(folio: string, estado: string, motivo?: string) {
    return request<{ folio: string; estado: string; state_changed_at: string }>(
      `/report/${encodeURIComponent(folio)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ estado, motivo: motivo || undefined }),
      },
    );
  },

  /** Lista las zonas. El administrador recibe todas y el alimentador solo la suya. */
  getZones(signal?: AbortSignal) {
    return request<{ zones: Zone[] | null }>('/zones', { signal });
  },

  /** Lista los reportes. El administrador recibe los de todas las zonas y el alimentador solo los de la suya. */
  getAllReports(signal?: AbortSignal) {
    return request<{ reports: Report[] | null }>('/report/all', { signal });
  },

  /**
   * Lista los reportes de una zona.
   * @param zone - UUID de la zona o nombre del municipio.
   */
  getReportsByZone(zone: string, signal?: AbortSignal) {
    return request<{ reports: Report[] | null }>(
      `/report/zone/${encodeURIComponent(zone)}`,
      { signal },
    );
  },

  /** Obtiene el detalle de un reporte, con imágenes. */
  getReportByFolio(folio: string, signal?: AbortSignal) {
    return request<{ report: ReportDetail }>(
      `/report/${encodeURIComponent(folio)}`,
      { signal },
    );
  },

  /**
   * Crea un reporte en borrador. Sin sesión es anónimo y regresa `edit_token`,
   * que se manda en los pasos siguientes para poder editarlo.
   */
  createReport(payload: CreateReportPayload) {
    return request<{ reporte_id: string; folio: string; edit_token?: string }>('/report', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Registra las fotos que se van a subir; regresa sus ids en el mismo orden. */
  registerReportImages(reportId: string, files: File[], editToken?: string) {
    return request<{ success: string[] }>(`/report/${encodeURIComponent(reportId)}/images`, {
      method: 'POST',
      headers: editTokenHeader(editToken),
      body: JSON.stringify({
        images: files.map((file) => ({ file_name: file.name, content_type: file.type })),
      }),
    });
  },

  /** Sube una foto ya registrada. */
  uploadReportImage(reportId: string, imageId: string, file: File, editToken?: string) {
    const body = new FormData();
    body.append('file', file);
    return request<unknown>(
      `/report/${encodeURIComponent(reportId)}/images/${encodeURIComponent(imageId)}`,
      { method: 'PUT', headers: editTokenHeader(editToken), body, timeoutMs: 60_000 },
    );
  },

  /** Envía el reporte: deja de ser borrador y pasa a revisión. */
  submitReport(reportId: string, editToken?: string) {
    return request<unknown>(`/report/${encodeURIComponent(reportId)}/submit`, {
      method: 'PUT',
      headers: editTokenHeader(editToken),
    });
  },

  /** Elimina un reporte. */
  deleteReport(folio: string) {
    return request<unknown>(`/report/${encodeURIComponent(folio)}`, { method: 'DELETE' });
  },

  /** Lista los casos. El administrador recibe todos y el alimentador solo los de su zona. */
  getCases(signal?: AbortSignal) {
    return request<{ cases: Case[] | null }>('/cases', { signal });
  },

  /** Crea un caso y le asigna los reportes indicados. */
  createCase(name: string, folios: string[]) {
    return request<{ case: Case }>('/cases', {
      method: 'POST',
      body: JSON.stringify({ name, folios }),
    });
  },

  /**
   * Asigna un reporte a un caso existente.
   * @param caseId - `null` para quitarlo del caso.
   */
  setReportCase(folio: string, caseId: string | null) {
    return request<{ folio: string; case_id: string | null; case_name: string | null }>(
      `/report/${encodeURIComponent(folio)}/case`,
      {
        method: 'PATCH',
        body: JSON.stringify({ case_id: caseId }),
      },
    );
  },

  /** Lista las cuentas de staff. Solo administradores activos. */
  getStaff(signal?: AbortSignal) {
    return request<{ staff: StaffMember[] | null }>('/admin/staff', { signal });
  },

  /** Crea una cuenta de staff pendiente y le envía la invitación por correo. Usa 15 s porque incluye el envío del correo. */
  createStaff(payload: CreateStaffPayload) {
    return request<{ staff: StaffMember }>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  /** Reenvía la invitación de una cuenta que todavía no la acepta; el enlace anterior deja de servir. */
  resendInvitation(id: string) {
    return request<{ message: string }>(`/admin/staff/${encodeURIComponent(id)}/invitation`, {
      method: 'POST',
      timeoutMs: 15000,
    });
  },

  /** Datos de la invitación con el token del enlace del correo. Va en el cuerpo (POST) para que no quede en los logs del backend. */
  getInvitation(token: string, signal?: AbortSignal) {
    return request<Invitation>('/auth/invitation', {
      method: 'POST',
      body: JSON.stringify({ token }),
      signal,
    });
  },

  /** Acepta la invitación con la contraseña elegida; el backend activa la cuenta y deja la cookie de sesión. */
  acceptInvitation(token: string, password: string) {
    return request<SessionResponse>('/auth/invitation/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    });
  },

  /** Rechaza la invitación; el backend borra la cuenta. */
  rejectInvitation(token: string) {
    return request<{ message: string }>('/auth/invitation/reject', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  /** Actualiza rol, zona o estado de una cuenta de staff. */
  updateStaff(id: string, payload: UpdateStaffPayload) {
    return request<{ staff: StaffMember }>(`/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /** Envía un código de recuperación por correo o SMS. Usa un timeout de 15 s porque enviar el correo puede tardar más que los 8 s por defecto. */
  forgotPassword(payload: ForgotPasswordPayload) {
    return request<{ message: string }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 15000,
    });
  },

  /** Cambia la contraseña usando el código de recuperación. */
  resetPassword(payload: ResetPasswordPayload) {
    return request<{ message: string }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};