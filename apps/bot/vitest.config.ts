import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true
      }
    },
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      // Coverage only carries signal when unit + integration run together;
      // integration tests are what actually exercise src/services/**.
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/index.ts',
        'src/generated/**',
        'src/**/*.d.ts',
        'src/commands/**',
        'src/listeners/**',
        'src/renderers/**',
        'src/scheduled-tasks/**'
      ],
      thresholds: {
        // Money-path services must stay verified before merge. See issue #29.
        'src/services/**': {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80
        }
      }
    }
  }
})
