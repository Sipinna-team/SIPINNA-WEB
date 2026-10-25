import { defineConfig, devices } from '@playwright/test'

/**
 * Pruebas de extremo a extremo de la web. La app se compila con `VITE_API_URL=/api` y cada prueba
 * simula la API con `page.route` (tests/e2e/mockApi.ts): no se usa la base de datos real ni se crean
 * reportes reales. Mapbox, INEGI y Supabase se bloquean.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
    env: {
      VITE_API_URL: '/api',
      VITE_MAP_BOX_TOKEN: 'pk.prueba',
      VITE_SUPABASE_URL: 'http://localhost:4173/supabase',
      VITE_SUPABASE_ANON_KEY: 'clave-de-prueba',
      VITE_REPORTS_ZONE: '',
    },
  },
})
