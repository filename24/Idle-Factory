import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  // tsconfig 의 path alias(@utils/@structures/@managers/@types)를 그대로 해석한다.
  // 없으면 alias 를 쓰는 소스는 테스트에서 로드조차 되지 않아, 테스트를 쓰려고
  // 소스의 import 스타일을 relative 로 바꾸는 본말전도가 생긴다.
  plugins: [tsconfigPaths()],
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
