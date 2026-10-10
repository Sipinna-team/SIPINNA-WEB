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
  created_at: string;
};

/** Datos para crear una cuenta de staff. Se necesita `email` o `telefono`. */
export type CreateStaffPayload = {
  nombre: string;
  rol: AdminRole;
  zona_id: string | null;
  email: string;
  telefono: string;
  password: string;
  activar: boolean;
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

const DEFAULT_TIMEOUT_MS = 8000;
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
      headers: { 'Content-Type': 'application/json', ...fetchOptions.headers },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(data?.error ?? data?.message ?? `Error ${response.status}`);
    }

    return data as T;
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error('El servidor no respondió a tiempo. Intenta de nuevo más tarde.');
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

  /** Elimina un reporte. */
  deleteReport(folio: string) {
    return request<unknown>(`/report/${encodeURIComponent(folio)}`, { method: 'DELETE' });
  },

  /** Lista las cuentas de staff. Solo administradores activos. */
  getStaff(signal?: AbortSignal) {
    return request<{ staff: StaffMember[] | null }>('/admin/staff', { signal });
  },

  /** Crea una cuenta de staff. */
  createStaff(payload: CreateStaffPayload) {
    return request<{ staff: StaffMember }>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
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