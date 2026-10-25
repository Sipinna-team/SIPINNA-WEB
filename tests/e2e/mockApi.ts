import type { Page } from '@playwright/test'

/**
 * API simulada para las pruebas de la web. Responde como la API de Go (mismas rutas y JSON)
 * y guarda cada petición en `calls` para revisar qué mandó la web.
 */

type User = { name: string; user_type: 'administrador' | 'alimentador' | 'citizen'; zone_name: string }

export const ADMIN: User = { name: 'Mónica Admin', user_type: 'administrador', zone_name: '' }
export const CITIZEN: User = { name: 'Ana López', user_type: 'citizen', zone_name: '' }

/** Contraseña válida de las cuentas simuladas. */
export const PASSWORD = 'Sipinna#2026'

/** Reporte de ejemplo; cada uno cambia solo lo necesario. */
function report(folio: string, hoursAgo: number, extra: Record<string, unknown> = {}) {
  const date = new Date(Date.now() - hoursAgo * 3_600_000).toISOString()
  return {
    folio,
    description: 'Niño vendiendo dulces en el semáforo',
    latitude: 19.5645,
    longitude: -99.2734,
    children_quantity: 1,
    work_type: 'Venta ambulante',
    created_at: date,
    suspicius_level: 0,
    children_age: '6 a 11 años',
    zone_name: 'Atizapán',
    zone_municipio: 'Atizapán de Zaragoza',
    citizen_name: 'Ana López',
    last_state: 'registrado',
    state_changed_at: date,
    sighting_time: '',
    risk: 'no',
    immediate_danger: false,
    priority: 'normal',
    sex: '',
    reference: '',
    duplicate_of: '',
    children_cared: null,
    ...extra,
  }
}

/** 3 reportes: 2 de hoy y 1 sin atender desde hace más de 48 h. */
export const REPORTS = [
  report('RIETI-ATI-2026-0001', 1),
  report('RIETI-ATI-2026-0002', 60, { description: 'Dos niñas pidiendo dinero en el crucero', work_type: 'Mendicidad' }),
  report('RIETI-TLA-2026-0001', 5, { zone_name: 'Tlalnepantla', zone_municipio: 'Tlalnepantla de Baz', last_state: 'en_revision', citizen_name: '',
    // Texto que Excel interpretaría como fórmula si el CSV no lo protege.
    description: '=HYPERLINK("http://malicioso.example","clic aquí")' }),
]

export type Call = { method: string; path: string; body: unknown }
type Reply = { status?: number; body?: unknown } | 'sin-conexion'

/**
 * Activa la API simulada en la página.
 * @param user - Usuario con sesión al abrir la página (`null` = sin sesión).
 * @param overrides - Respuestas distintas a las de siempre, por "MÉTODO /ruta".
 */
export async function mockApi(page: Page, user: User | null = null, overrides: Record<string, () => Reply> = {}) {
  const calls: Call[] = []
  let session = user

  await page.route(/mapbox\.com|inegi\.org\.mx|\/supabase\//, (route) => route.abort())

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const method = request.method()
    const path = new URL(request.url()).pathname.replace(/^\/api/, '')
    let body: unknown
    try {
      body = request.postDataJSON()
    } catch {
      body = null
    }
    calls.push({ method, path, body })

    const key = `${method} ${path}`
    const reply = overrides[key]?.() ?? defaultReply(method, path, body)
    if (reply === 'sin-conexion') return route.abort('connectionrefused')
    return route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body ?? {}) })
  })

  function defaultReply(method: string, path: string, body: unknown): Reply {
    const data = (body ?? {}) as Record<string, string | null>

    if (method === 'GET' && path === '/auth/me') return session ? { body: session } : { status: 401, body: { error: 'sin sesión' } }
    if (method === 'POST' && path === '/auth/login') {
      if (data.password !== PASSWORD) return { status: 401, body: { error: 'credenciales inválidas' } }
      session = data.email?.startsWith('admin') ? ADMIN : CITIZEN
      return { body: session }
    }
    if (method === 'POST' && path === '/auth/logout') {
      session = null
      return { body: { message: 'Logged out successfully' } }
    }
    if (method === 'POST' && path === '/auth/citizen') return { status: 201, body: { message: 'ok' } }

    if (method === 'GET' && path === '/zones') return { body: { zones: [] } }
    if (method === 'GET' && path === '/cases') return { body: { cases: [] } }
    if (method === 'GET' && path === '/report/all') {
      return session && session.user_type !== 'citizen' ? { body: { reports: REPORTS } } : { status: 403, body: { error: 'prohibido' } }
    }
    if (method === 'GET' && /^\/report\/[^/]+\/acciones$/.test(path)) return { body: { actions: [] } }
    if (method === 'GET' && /^\/report\/[^/]+$/.test(path)) {
      const found = REPORTS.find((r) => r.folio === decodeURIComponent(path.split('/')[2]!))
      return found ? { body: { report: { ...found, images: [] } } } : { status: 404, body: { error: 'no encontrado' } }
    }
    if (method === 'PATCH' && path.endsWith('/status')) {
      return { body: { folio: decodeURIComponent(path.split('/')[2]!), estado: data.estado, state_changed_at: new Date().toISOString() } }
    }

    // Reporte nuevo en 4 pasos: crear, registrar fotos, subir cada foto, enviar.
    if (method === 'POST' && path === '/report') {
      return { status: 201, body: { reporte_id: 'rep-1', folio: 'RIETI-ATI-2026-0099', clave_consulta: 'K7P2-9QX', edit_token: session ? undefined : 'tok-anon' } }
    }
    if (method === 'POST' && path === '/report/rep-1/images') return { body: { success: ['img-1'] } }
    if (method === 'PUT' && path.startsWith('/report/rep-1/')) return { body: { message: 'ok' } }

    if (method === 'GET' && path.startsWith('/public/report/')) return { status: 404, body: { error: 'no encontrado' } }
    if (method === 'GET' && path === '/admin/staff') return { body: { staff: [] } }
    if (method === 'GET' && path === '/admin/bitacora') return { body: { entries: [] } }
    return { status: 404, body: { error: `sin simulación para ${method} ${path}` } }
  }

  return calls
}
