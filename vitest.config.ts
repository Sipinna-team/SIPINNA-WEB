import { defineConfig } from 'vitest/config'

// Pruebas unitarias (sin navegador). Las de extremo a extremo están en tests/e2e y usan Playwright.
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    env: { TZ: 'America/Mexico_City' },
  },
})
