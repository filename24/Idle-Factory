/**
 * 글로벌 마켓 자재 기준가 테이블 — 순수 상수 모듈.
 *
 * `GlobalMarketPrice.basePrice` 의 시드값을 game-core 로 옮겨 온 것이다.
 * `market/price.ts` 의 `computeNextPrice` 는 기준가를 **입력으로** 받으므로,
 * DB 없이 도는 밸런스 시뮬레이터(#31)가 가격 tick 을 재현하려면 이 앵커가
 * 순수 계층에 있어야 한다.
 *
 * **Prisma 와 수동 동기화 (필독)**: 이 테이블은
 * `packages/database/prisma/seed.ts` 의 `MARKET_BASE_PRICES` 와 값이 같아야
 * 한다. game-core 는 Prisma 를 import 할 수 없으므로(패키지 규약: DB/Prisma
 * 의존 금지) 자동 동기화 수단이 없다 — 한쪽을 고치면 반드시 다른 쪽도 고치고,
 * `tests/simulation/basePrices.test.ts` 의 동기화 가드 테스트를 갱신할 것.
 *
 * 수치 근거:
 *  - docs/design/00-onboarding.md §밸런스 기준 — "T1 공장은 등급별 tick당 수익이
 *    300~400원/tick 으로 수렴하도록 기준가를 설정".
 *    (FARM 30/tick × 10 = 300, MINE 15 × 20 = 300, LUMBER 25 × 15 = 375,
 *     OIL_WELL 8 × 50 = 400 — 카탈로그 `baseProduction` 과 맞물린 앵커다.)
 *  - docs/design/06-market.md §가격 산출 공식 — 기준가는 30분 가격 tick 의
 *    진동 중심이며 상하한(70%~200%)의 기준이기도 하다.
 */

import type { MaterialType } from '../types'

/**
 * 자재별 글로벌 마켓 기준가 (화폐, bigint).
 *
 * `packages/database/prisma/seed.ts` 의 `MARKET_BASE_PRICES` 와 1:1 동일해야
 * 한다(모듈 상단 동기화 규약 참조). T1 원자재 4종은 T1 공장의 tick 당 수익이
 * 300~400원에 들어오도록 역산된 값이다
 * (docs/design/00-onboarding.md §밸런스 기준).
 */
export const MARKET_BASE_PRICES: Readonly<Record<MaterialType, bigint>> = {
  // T1 — 원자재
  GRAIN: 10n,
  ORE: 20n,
  WOOD: 15n,
  CRUDE_OIL: 50n,
  // T2 — 가공재
  STEEL: 50n,
  FUEL: 80n,
  PLASTIC: 60n,
  PROCESSED_FOOD: 25n,
  FURNITURE: 60n,
  // T3 — 완제품
  CAR: 500n,
  ELECTRONIC: 800n,
  FINISHED_FOOD: 150n,
  // 특수 — T3 저확률 드롭, 초고가 (docs/design/04-economy.md §희귀 원자재)
  RAW_BOOSTER: 1_000_000n,
}

/**
 * 자재의 기준가를 반환한다.
 *
 * @param material 자재 종류
 * @returns 기준가 (bigint, >= 1)
 */
export function basePriceOf(material: MaterialType): bigint {
  return MARKET_BASE_PRICES[material]
}

/**
 * 전 자재의 기준가를 `Map` 으로 스냅샷한다.
 *
 * `evaluateTotalAssets` 의 `prices` 인자처럼 `ReadonlyMap<MaterialType, bigint>`
 * 를 요구하는 API 에 그대로 넘길 수 있는 초기 시세로 쓴다 — 시뮬레이션 시작
 * 시점의 `currentPrice` 는 시드와 동일하게 `basePrice` 다
 * (seed.ts 가 `currentPrice: basePrice` 로 upsert).
 *
 * @returns 자재 → 기준가 맵 (호출마다 새 Map)
 */
export function baseMarketPrices(): Map<MaterialType, bigint> {
  return new Map(Object.entries(MARKET_BASE_PRICES) as [MaterialType, bigint][])
}
