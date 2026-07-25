import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // index.ts 는 배럴 재export 뿐이고 types.ts 는 타입 선언만 담아 런타임
      // 코드가 없다 — 분모에서 빼지 않으면 게이트가 실제 로직 검증도와
      // 무관하게 흔들린다.
      exclude: ['src/**/index.ts', 'src/**/types.ts'],
      thresholds: {
        // #21 최종 QA: game-core 는 돈·생산 공식의 단일 진실원이라 80% 를
        // 하한으로 고정한다. 게이트 도입 시점 실측은 97% 대였다.
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
