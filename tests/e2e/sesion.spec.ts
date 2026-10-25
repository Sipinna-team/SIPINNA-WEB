import { expect, test } from '@playwright/test'
import { ADMIN, CITIZEN, PASSWORD, mockApi } from './mockApi'

test.describe('Inicio de sesión, registro y acceso (RF01, RF03, RF11, RF21)', () => {
  test('CP-WEB-01 el personal inicia sesión con correo y llega al dashboard', async ({ page }) => {
    await mockApi(page)
    await page.goto('/login')
    await page.getByLabel('Correo o número').fill('admin@sipinna.test')
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('CP-WEB-02 con contraseña incorrecta muestra un aviso y no entra', async ({ page }) => {
    await mockApi(page)
    await page.goto('/login')
    await page.getByLabel('Correo o número').fill('admin@sipinna.test')
    await page.getByLabel('Contraseña', { exact: true }).fill('incorrecta')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await expect(page.getByRole('alert')).toHaveText('No se pudo iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.')
    await expect(page).toHaveURL(/\/login$/)
  })

  test('CP-WEB-03 registro válido crea la cuenta y entra al inicio', async ({ page }) => {
    const calls = await mockApi(page)
    await page.goto('/register')
    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('López')
    await page.getByLabel('Género').selectOption('mujer')
    await page.getByLabel('Edad').fill('28')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirmar contraseña').fill(PASSWORD)
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page).toHaveURL(/\/inicio$/)
    expect(calls.some((c) => c.method === 'POST' && c.path === '/auth/citizen')).toBe(true)
  })

  test('CP-WEB-04 si las contraseñas no coinciden, no se crea la cuenta', async ({ page }) => {
    const calls = await mockApi(page)
    await page.goto('/register')
    await page.getByLabel('Nombre').fill('Ana')
    await page.getByLabel('Apellido').fill('López')
    await page.getByLabel('Género').selectOption('mujer')
    await page.getByLabel('Edad').fill('28')
    await page.getByLabel('Correo electrónico').fill('ana@correo.test')
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD)
    await page.getByLabel('Confirmar contraseña').fill('Otra#Distinta1')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await expect(page.getByRole('alert')).toHaveText('Las contraseñas no coinciden.')
    expect(calls.some((c) => c.path === '/auth/citizen')).toBe(false)
  })

  test('CP-WEB-05 sin sesión, las pantallas del personal mandan al login', async ({ page }) => {
    await mockApi(page)
    for (const path of ['/dashboard', '/reports', '/map']) {
      await page.goto(path)
      await expect(page, `al abrir ${path}`).toHaveURL(/\/login$/)
    }
  })

  test('CP-WEB-06 un ciudadano con sesión no puede abrir las pantallas del personal', async ({ page }) => {
    await mockApi(page, CITIZEN)
    for (const path of ['/dashboard', '/reports', '/map']) {
      await page.goto(path)
      await expect(page, `al abrir ${path}`).toHaveURL(/\/inicio$/)
    }
  })

  test('CP-WEB-07 cerrar sesión desde el dashboard regresa al inicio', async ({ page }) => {
    const calls = await mockApi(page, ADMIN)
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: 'Reportes por estado' })).toBeVisible()
    await page.getByRole('button', { name: 'Cerrar sesión' }).first().click()
    await expect(page).toHaveURL(/\/inicio$/)
    expect(calls.some((c) => c.path === '/auth/logout')).toBe(true)
  })
})
