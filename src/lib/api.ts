const API_BASE_URL = import.meta.env.VITE_API_URL;

// Solo uno de email/number va lleno; el otro se manda explícitamente como null.
export type LoginPayload = {
  email: string | null;
  number: string | null;
  password: string;
};

export type RegisterCitizenPayload = {
  nombre: string;
  edad: number;
  genero: string;
  email: string;
  telefono: string;
  password: string;
};

// Igual que en login: solo uno de email/number va lleno, el otro en null.
export type ForgotPasswordPayload = {
  email: string | null;
  number: string | null;
};

export type ResetPasswordPayload = ForgotPasswordPayload & {
  code: string;
  new_password: string;
};

// user_type viene del rol en la tabla admins; si el usuario no es staff es 'citizen'.
export type UserType = 'administrador' | 'alimentador' | 'citizen';

export type SessionResponse = {
  name: string;
  user_type: UserType;
  // Vacío para ciudadanos o staff sin zona asignada.
  zone_name: string;
};

// Reporte que devuelven GET /report/all y GET /report/zone/:zone_id (solo staff).
export type Report = {
  folio: string;
  description: string;
  latitude: number;
  longitude: number;
  children_quantity: number;
  work_type: string;
  created_at: string;
  suspicius_level: number;
  children_age: string;
  zone_name: string;
  citizen_name: string;
  last_state: string;
  state_changed_at: string;
  first_attention_at?: string | null;
};

// latitude/longitude son "null" si la zona no tiene coordenadas en la BD.
export type Zone = {
  id: string;
  name: string;
  municipio: string;
  latitude: number | null;
  longitude: number | null;
};

export type AdminRole = 'administrador' | 'alimentador';
export type AccountState = 'activada' | 'pendiente';

// Cuenta de admins que gestiona administradors/alimentadores
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

// Se necesita email o telefono
export type CreateStaffPayload = {
  nombre: string;
  rol: AdminRole;
  zona_id: string | null;
  email: string;
  telefono: string;
  password: string;
  activar: boolean;
};

// Campos omitidos
export type UpdateStaffPayload = {
  rol?: AdminRole;
  zona_id?: string;
  estado_cuenta?: AccountState;
};

export type ReportDetail = Report & {
  sighting_time: string;
  images: string[];
};

const DEFAULT_TIMEOUT_MS = 8000;
type RequestOptions = RequestInit & { timeoutMs?: number };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...fetchOptions } = options;

  // Aborta si la API no responde a tiempo
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

export const api = {
  login(payload: LoginPayload) {
    return request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Canjea el access_token de Supabase (login con Google) por la cookie de sesión.
  loginWithGoogle(accessToken: string) {
    return request<SessionResponse>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ access_token: accessToken }),
    });
  },

  me() {
    return request<SessionResponse>('/auth/me');
  },

  logout() {
    return request<unknown>('/auth/logout', { method: 'POST' });
  },

  registerCitizen(payload: RegisterCitizenPayload) {
    return request<unknown>('/auth/citizen', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // motivo es obligatorio para cancelado, archivado y reincidente.
  updateReportStatus(folio: string, estado: string, motivo?: string) {
    return request<{ folio: string; estado: string; state_changed_at: string }>(
      `/report/${encodeURIComponent(folio)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ estado, motivo: motivo || undefined }),
      },
    );
  },

  // Administrador recibe todas las zonas y el alimentador solo la suya
  getZones(signal?: AbortSignal) {
    return request<{ zones: Zone[] | null }>('/zones', { signal });
  },

  // Administrador recibe todas las zonas y el alimentador solo la suya.
  getAllReports(signal?: AbortSignal) {
    return request<{ reports: Report[] | null }>('/report/all', { signal });
  },

  // "ZONE" acepta el UUID de la zona o el nombre del municipio
  getReportsByZone(zone: string, signal?: AbortSignal) {
    return request<{ reports: Report[] | null }>(
      `/report/zone/${encodeURIComponent(zone)}`,
      { signal },
    );
  },

  getReportByFolio(folio: string, signal?: AbortSignal) {
    return request<{ report: ReportDetail }>(
      `/report/${encodeURIComponent(folio)}`,
      { signal },
    );
  },

  deleteReport(folio: string) {
    return request<unknown>(`/report/${encodeURIComponent(folio)}`, { method: 'DELETE' });
  },

  // Solo administradores activos.
  getStaff(signal?: AbortSignal) {
    return request<{ staff: StaffMember[] | null }>('/admin/staff', { signal });
  },

  createStaff(payload: CreateStaffPayload) {
    return request<{ staff: StaffMember }>('/admin/staff', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStaff(id: string, payload: UpdateStaffPayload) {
    return request<{ staff: StaffMember }>(`/admin/staff/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  forgotPassword(payload: ForgotPasswordPayload) {
    return request<{ message: string }>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify(payload),
      // enviar el correo puede tardar más que el timeout por defecto de 8 s
      timeoutMs: 15000,
    });
  },

  resetPassword(payload: ResetPasswordPayload) {
    return request<{ message: string }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};