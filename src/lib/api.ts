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

// user_type viene del rol en la tabla admins; si el usuario no es staff es 'citizen'.
export type UserType = 'administrador' | 'alimentador' | 'citizen';

export type SessionResponse = {
  name: string;
  user_type: UserType;
  // Vacío para ciudadanos o staff sin zona asignada.
  zone_name: string;
};

// La forma exacta del reporte la define el backend en POST /report.
export type CrearReportePayload = Record<string, unknown>;

// Detalle que devuelve GET /report/:zone_id (solo admin).
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

  crearReporte(data: CrearReportePayload) {
    return request<unknown>('/report', {
      method: 'POST',
      body: JSON.stringify(data),
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

  // zone acepta el UUID de la zona o el nombre del municipio.
  getReportsByZone(zone: string, signal?: AbortSignal) {
    return request<{ reports: Report[] | null }>(
      `/report/${encodeURIComponent(zone)}`,
      { signal },
    );
  },
};
