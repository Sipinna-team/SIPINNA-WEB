import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { ADMIN, mockApi } from './mockApi'

test.describe('Herramientas del personal (RF23, RF27, RF28, RF32–RF37, RF41)', () => {
  // Sin animación de los números, para leer el valor final de cada indicador.
  test.use({ contextOptions: { reducedMotion: 'reduce' } })

  test('CP-WEB-13 el dashboard muestra los indicadores con los reportes recibidos', async ({ page }) => {
    await mockApi(page, ADMIN)
    await page.goto('/dashboard')
    const tile = (title: string) =>
      page.locator('section, article, div').filter({ has: page.getByRole('heading', { name: title, exact: true }) }).last()
    await expect(tile('Total de reportes')).toContainText('3')
    await expect(tile('Reportes de hoy')).toContainText('2')
    await expect(tile('Sin atender +48 h')).toContainText('1')
  })

  test('CP-WEB-14 buscar y filtrar por estado en la lista de reportes', async ({ page }) => {
    await mockApi(page, ADMIN)
    await page.goto('/reports')
    const rows = page.locator('table tbody tr')
    await expect(rows).toHaveCount(3)

    await page.getByLabel('Buscar').fill('crucero')
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('RIETI-ATI-2026-0002')

    await page.getByLabel('Buscar').fill('')
    await page.getByLabel('Estado').selectOption({ label: 'En revisión' })
    await expect(rows).toHaveCount(1)
    await expect(rows).toContainText('RIETI-TLA-2026-0001')
  })

  test('CP-WEB-15 exportar CSV descarga un archivo con una fila por reporte y sin fórmulas', async ({ page }) => {
    await mockApi(page, ADMIN)
    await page.goto('/reports')
    await expect(page.locator('table tbody tr')).toHaveCount(3)
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exportar CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^reportes-sipinna-\d{4}-\d{2}-\d{2}\.csv$/)
    const lines = (await readFile((await download.path())!, 'utf8')).trim().split('\r\n')
    expect(lines).toHaveLength(4) // encabezado + 3 reportes
    // Una descripción que empieza con "=" no debe quedar como fórmula ejecutable en Excel.
    expect(lines.join('\n')).not.toMatch(/(^|,)"?=HYPERLINK/m)
  })

  test('CP-WEB-16 cancelar un reporte exige motivo y manda el cambio de estado', async ({ page }) => {
    const calls = await mockApi(page, ADMIN)
    await page.goto('/map?folio=RIETI-ATI-2026-0001')
    const form = page.locator('form.status-form').filter({ has: page.getByRole('button', { name: 'Cambiar estado' }) })

    await form.getByLabel('Estado').selectOption('cancelado')
    await expect(form.getByRole('button', { name: 'Cambiar estado' })).toBeDisabled()
    await form.getByLabel(/Motivo/).fill('Reporte de prueba')
    await form.getByRole('button', { name: 'Cambiar estado' }).click()

    await expect.poll(() => calls.find((c) => c.method === 'PATCH')?.body).toEqual({ estado: 'cancelado', motivo: 'Reporte de prueba' })
  })
})

test.describe('Diseño responsivo (RNF-17)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('CP-WEB-17 inicio, login y reportar caben en un celular sin scroll horizontal', async ({ page }) => {
    await mockApi(page)
    for (const path of ['/inicio', '/login', '/reportar']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `desborde en ${path}`).toBeLessThanOrEqual(1)
    }
  })
})
