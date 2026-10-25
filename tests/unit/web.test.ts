import { describe, expect, it } from 'vitest'
import { computeDashboardStats } from '../../src/lib/dashboardStats'
import type { Report } from '../../src/lib/api'
import { passwordError } from '../../src/lib/passwordPolicy'

describe('CP-WEB-U1 Política de contraseñas (RF01)', () => {
  it('acepta 10 caracteres con mayúscula y símbolo', () => {
    expect(passwordError('Sipinna#26')).toBeNull()
  })
  it('rechaza 9 caracteres', () => {
    expect(passwordError('Sipinna#2')).toMatch(/al menos 10/)
  })
  it('rechaza sin mayúscula', () => {
    expect(passwordError('sipinna#2026')).toMatch(/mayúscula/)
  })
  it('rechaza sin símbolo', () => {
    expect(passwordError('Sipinna2026')).toMatch(/símbolo/)
  })
})

describe('CP-WEB-U2 Indicadores del dashboard (RF32–RF36)', () => {
  const now = new Date('2026-10-25T12:00:00-06:00')
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()
  const base = { latitude: 19.56, longitude: -99.27, suspicius_level: 0, work_type: 'Venta ambulante', children_age: '6 a 11 años' }
  const reports = [
    { ...base, folio: 'A', created_at: hoursAgo(1), last_state: 'registrado', zone_municipio: 'Atizapán de Zaragoza' },
    { ...base, folio: 'B', created_at: hoursAgo(2), last_state: 'en_revision', zone_municipio: 'Atizapán de Zaragoza' },
    { ...base, folio: 'C', created_at: hoursAgo(72), last_state: 'registrado', zone_municipio: 'Tlalnepantla de Baz' },
  ] as unknown as Report[]
  const stats = computeDashboardStats(reports, now)

  it('cuenta el total, los de hoy y los sin atender más de 48 h', () => {
    expect(stats.total).toBe(3)
    expect(stats.today).toBe(2)
    expect(stats.unattended).toBe(1)
  })
  it('ordena las zonas de mayor a menor', () => {
    expect(stats.byZone.map((z) => z.zone)).toEqual(['Atizapán de Zaragoza', 'Tlalnepantla de Baz'])
  })
  it('sin reportes no muestra NaN', () => {
    expect(computeDashboardStats([], now).attendedPct).toBeNull()
  })
})
