import { defineConfig } from 'vitest/config'

/**
 * 단위 테스트(vitest) — 순수 로직 모듈 전용. Playwright e2e(tests/e2e)와 분리한다.
 * 순수 함수만 대상이라 브라우저/DB 없이 node 환경에서 실행한다.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
})
