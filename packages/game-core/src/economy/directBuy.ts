/**
 * 자재 직구매(돈 → 자재) 순수 계산 모듈.
 *
 * 규칙 근거: docs/design/04-economy.md §자재 직구매
 *  - 가격: 글로벌 마켓 현재가 ×2배 할증
 *  - 구매 가능 자재: T1 + T2 만 (T3 완제품·RAW_BOOSTER 불가)
 *  - 일일 한도: 레벨 구간별 총합 한도 (자재 종류 무관 합산)
 *  - 리셋: 매일 KST 자정 (#16 확정 — kst.ts 참조)
 */

import type { MaterialType } from '../types'

/**
 * 직구매 허용 자재 — T1 원자재 4종 + T2 가공재 5종.
 *
 * 근거: docs/design/04-economy.md §자재 직구매 "구매 가능 자재: T1 + T2 자재만
 * (T3 완제품은 불가)". RAW_BOOSTER 는 자재가 아닌 특수 부스터로 직구매 불가
 * (같은 문서 §희귀 원자재 흐름 — 글로벌 마켓·유저 상점 경로만 존재).
 * 티어 분류 근거: docs/design/03-factories.md (types.ts `MaterialType` 주석).
 */
export const DIRECT_BUY_MATERIALS: readonly MaterialType[] = [
  // T1
  'GRAIN',
  'ORE',
  'WOOD',
  'CRUDE_OIL',
  // T2
  'STEEL',
  'FUEL',
  'PLASTIC',
  'PROCESSED_FOOD',
  'FURNITURE',
]

const DIRECT_BUY_MATERIAL_SET: ReadonlySet<MaterialType> = new Set(DIRECT_BUY_MATERIALS)

/**
 * 직구매 단가 할증 배율 — 글로벌 현재가의 2배.
 * 근거: docs/design/04-economy.md §가격 결정 "구매가 = 글로벌 마켓 현재가 × 2".
 */
export const DIRECT_BUY_PRICE_MULTIPLIER = 2n

/**
 * 레벨 구간별 일일 총 구매 한도 테이블 (구간 상한 포함).
 *
 * 근거: docs/design/04-economy.md §레벨별 일일 한도
 * | 1~5 | 100 | · | 6~15 | 500 | · | 16~30 | 2,000 | · | 31+ | 10,000 |
 * 자재 종류와 무관한 **총합 한도** (예: 곡물 50 + 광석 50 = 100 소진).
 */
export const DIRECT_BUY_DAILY_LIMITS: ReadonlyArray<{
  /** 구간 상한 레벨 (포함). null 은 무제한 상한(31+). */
  readonly maxLevel: number | null
  /** 하루 최대 구매 수량 (전 자재 합산). */
  readonly limit: number
}> = [
  { maxLevel: 5, limit: 100 },
  { maxLevel: 15, limit: 500 },
  { maxLevel: 30, limit: 2_000 },
  { maxLevel: null, limit: 10_000 },
]

/**
 * 해당 자재가 직구매 가능(T1+T2)한지 판별한다.
 *
 * T3 완제품(CAR·ELECTRONIC·FINISHED_FOOD)과 RAW_BOOSTER 는 false.
 * 근거: docs/design/04-economy.md §자재 직구매.
 *
 * @param material 판별할 자재
 * @returns 직구매 허용 여부
 */
export function isDirectBuyMaterial(material: MaterialType): boolean {
  return DIRECT_BUY_MATERIAL_SET.has(material)
}

/**
 * 유저 레벨의 일일 직구매 총 한도를 반환한다.
 *
 * 근거: docs/design/04-economy.md §레벨별 일일 한도 (100/500/2,000/10,000).
 *
 * @param level 유저 레벨 (>= 1 정수)
 * @returns 하루 최대 구매 수량 (전 자재 합산)
 * @throws {RangeError} level 이 1 미만이거나 정수가 아닌 경우
 */
export function directBuyDailyLimit(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`level must be an integer >= 1, got ${level}`)
  }
  for (const band of DIRECT_BUY_DAILY_LIMITS) {
    if (band.maxLevel === null || level <= band.maxLevel) return band.limit
  }
  // 도달 불가 — 마지막 구간이 maxLevel=null. 타입 안전용 방어.
  throw new RangeError(`no daily limit band for level ${level}`)
}

/**
 * 직구매 단가를 계산한다 — 글로벌 현재가 × 2 (BigInt 정수 산술).
 *
 * 글로벌 가격이 30분 tick 으로 변동하면 직구매가도 함께 변동한다
 * (docs/design/04-economy.md §가격 결정 "마켓 폭등 시 직구매도 비싸짐").
 *
 * @param currentPrice 글로벌 마켓 현재가 (>= 1)
 * @returns 직구매 단가 = currentPrice × 2
 * @throws {RangeError} currentPrice < 1 인 경우
 */
export function directBuyUnitPrice(currentPrice: bigint): bigint {
  if (currentPrice < 1n) {
    throw new RangeError(`currentPrice must be >= 1, got ${currentPrice}`)
  }
  return currentPrice * DIRECT_BUY_PRICE_MULTIPLIER
}
