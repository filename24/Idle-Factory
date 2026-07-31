import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      // index.ts 는 배럴 재export 뿐이라 런타임 로직이 없다 — 분모에서 빼지
      // 않으면 게이트가 실제 검증도와 무관하게 흔들린다. game-core 와 동일 규약.
      exclude: ['src/**/index.ts'],
      thresholds: {
        // 이 패키지는 돈·경험치·자재를 실제로 쓰는 트랜잭션 계층이다.
        // 원래 apps/bot/vitest.config.ts 가 `src/services/**` 에 걸어 두던
        // 80% 게이트("Money-path services must stay verified before merge",
        // issue #29)를 코드와 함께 이관한 것 — 봇에 재export 셸만 남으면
        // 그쪽 게이트는 공허하게 통과하므로 보증이 사라진다.
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
