/**
 * 경제 밸런스 시뮬레이터 배럴 (#31).
 *
 * game-core 순수 함수만 조립해 DB 없이 경제를 굴린다. 루트 배럴
 * (`src/index.ts`)에서 `export * from './simulation'` 로 재노출된다.
 */

export * from './types'
export * from './rng'
export * from './profiles'
export * from './state'
export * from './harvest'
export * from './sell'
export * from './directBuySim'
export * from './invest'
export * from './engine'
export * from './scenarios'
export * from './metrics'
export * from './targets'
export * from './charts'
export * from './artifact'
export * from './sweep'
export * from './report'
export * from './csv'
