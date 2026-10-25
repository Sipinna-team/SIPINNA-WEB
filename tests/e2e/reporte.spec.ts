import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { mockApi } from './mockApi'

// Ubicación simulada del navegador: Atizapán de Zaragoza.
test.use({ geolocation: { latitude: 19.5645, longitude: -99.2734 }, permissions: ['geolocation'] })

const choose = (page: Page, question: string, option: string) =>
  page.getByRole('group', { name: question }).getByRole('button', { name: option, exact: true }).click()

/** Reporte anónimo hasta la pantalla de revisión, con la descripción indicada. */
async function fillReport(page: Page, description: string) {
  await page.goto('/reportar')
  await page.getByRole('button', { name: /Reporte anónimo/ }).click()

  await page.getByRole('button', { name: 'Usar mi ubicación' }).click()
  await page.getByRole('button', { name: 'Confirmar ubicación' }).click()

  await choose(page, '¿La niña, niño o adolescente se encuentra en peligro inmediato?', 'No')
  await choose(page, '¿Cuántas niñas, niños o adolescentes observaste?', '2')
  await choose(page, 'Edad aproximada', '6 a 11 años')
  await choose(page, '¿Qué estaban haciendo?', 'Venta ambulante')
  await choose(page, '¿Observaste alguna situación de riesgo?', 'No sé')
  await choose(page, '¿Cuándo lo viste?', 'Ahora mismo')
  await page.getByRole('button', { name: 'Siguiente' }).click()

  await page.getByLabel('Descripción').fill(description)
}

test.describe('Reporte ciudadano y consulta por folio (RF04–RF09, RF16)', () => {
  test('CP-WEB-08 reporte anónimo completo: muestra folio y clave de consulta', async ({ page }) => {
    const calls = await mockApi(page)
    await fillReport(page, 'Dos niños vendiendo dulces entre los coches.')
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.getByRole('button', { name: 'Continuar sin foto' }).click()
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    await expect(page.getByText('RIETI-ATI-2026-0099')).toBeVisible()
    await expect(page.getByText('K7P2-9QX')).toBeVisible()
    const created = calls.find((c) => c.method === 'POST' && c.path === '/report')!.body as Record<string, unknown>
    expect(created).toMatchObject({ latitude: 19.5645, longitude: -99.2734, children_quantity: 2 })
  })

  test('CP-WEB-09 con una descripción de menos de 10 caracteres no se puede avanzar', async ({ page }) => {
    await mockApi(page)
    await fillReport(page, 'corto')
    await expect(page.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
    await expect(page.getByText('Escribe al menos 10 caracteres.')).toBeVisible()
  })

  test('CP-WEB-10 si el envío falla, se puede reintentar sin perder lo capturado', async ({ page }) => {
    let attempts = 0
    await mockApi(page, null, {
      'PUT /report/rep-1/submit': () => (++attempts === 1 ? { status: 500, body: { error: 'falla' } } : { body: {} }),
    })
    await fillReport(page, 'Dos niños vendiendo dulces entre los coches.')
    await page.getByRole('button', { name: 'Siguiente' }).click()
    await page.getByRole('button', { name: 'Continuar sin foto' }).click()
    await page.getByRole('button', { name: 'Enviar reporte' }).click()

    await expect(page.getByRole('alert')).toContainText('no se perderá lo que escribiste')
    await page.getByRole('button', { name: 'Reintentar envío' }).click()
    await expect(page.getByText('RIETI-ATI-2026-0099')).toBeVisible()
  })

  test('CP-WEB-11 consulta por folio y clave correctos muestra el estado', async ({ page }) => {
    await mockApi(page, null, {
      'GET /public/report/RIETI-ATI-2026-0099': () => ({
        body: { report: { folio: 'RIETI-ATI-2026-0099', status: 'en_revision', created_at: '2026-10-20T15:00:00Z', state_changed_at: '2026-10-21T15:00:00Z' } },
      }),
    })
    await page.goto('/consultar-folio')
    await page.getByLabel('Folio', { exact: true }).fill('RIETI-ATI-2026-0099')
    await page.getByLabel('Clave de consulta').fill('K7P2-9QX')
    await page.getByRole('button', { name: 'Consultar' }).click()
    await expect(page.getByRole('heading', { name: 'RIETI-ATI-2026-0099' })).toBeVisible()
    await expect(page.locator('body')).toContainText('En revisión')
  })

  test('CP-WEB-12 con una clave incorrecta no muestra datos del reporte', async ({ page }) => {
    await mockApi(page)
    await page.goto('/consultar-folio')
    await page.getByLabel('Folio', { exact: true }).fill('RIETI-ATI-2026-0099')
    await page.getByLabel('Clave de consulta').fill('equivocada')
    await page.getByRole('button', { name: 'Consultar' }).click()
    await expect(page.getByRole('alert')).toHaveText('No encontramos un reporte con ese folio y clave. Revisa que estén bien escritos.')
  })
})
