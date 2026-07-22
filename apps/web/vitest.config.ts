import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Unit tests only; Playwright owns the E2E layer (tests/e2e/**).
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/lib/**/*.ts'],
    },
  },
})
