/**
 * 주식 상장(IPO) 자격 판정 — 순수 판정 모듈.
 *
 * 상장 조건 4종의 AND 판정을 결정론적 함수로 제공한다. 레벨·공장 수·총자산·
 * 최근 거래 활성도 집계는 호출자(bot 서비스)가 수행해 인자로 주입한다.
 *
 * 근거: docs/design/08-stock.md §상장 조건 — "모든 조건 AND
 * (관리자 승인 없음 — 자동 검증)". 글로벌 주식 추가 조건(Lv.40+·신뢰도 1500+)은
 * 스코프 아웃 (D13 — GLOBAL 마켓 Phase 5+).
 */

/**
 * 상장 최소 레벨 — Lv.25.
 * 근거: docs/design/08-stock.md §상장 조건 "레벨: Lv.25 이상".
 */
export const LISTING_MIN_LEVEL = 25

/**
 * 상장 최소 공장 수 — 5개.
 * 근거: docs/design/08-stock.md §상장 조건 "공장 수: 5개 이상".
 */
export const LISTING_MIN_FACTORY_COUNT = 5

/**
 * 상장 최소 총자산 — 1억 원.
 * 근거: docs/design/08-stock.md §상장 조건 "총 자산: 1억 원 이상".
 */
export const LISTING_MIN_TOTAL_ASSETS = 100_000_000n

/**
 * 상장 최소 최근 30일 거래 횟수 — 10회.
 * 근거: docs/design/08-stock.md §상장 조건 "최근 거래 활성도: 최근 30일 거래 10회 이상".
 */
export const LISTING_MIN_RECENT_30D_TRADES = 10

/**
 * 상장 조건 미달 사유 코드 (docs/design/08-stock.md §상장 조건 표의 4행과 1:1).
 * 빈 배열 = 전 조건 충족(상장 가능).
 */
export type ListingConditionFailure =
  | 'LEVEL'
  | 'FACTORY_COUNT'
  | 'TOTAL_ASSETS'
  | 'RECENT_30D_TRADES'

/** `checkListingConditions` 입력 — 호출자가 집계해 주입하는 유저 지표 4종. */
export interface ListingConditionInput {
  /** 유저 레벨 (`User.level`, >= 1 정수). */
  readonly level: number
  /** 보유 공장 수 (>= 0 정수). */
  readonly factoryCount: number
  /** 총자산 (`evaluateTotalAssets` 결과, >= 0). */
  readonly totalAssets: bigint
  /** 최근 30일 거래 횟수 (TradeLog 카운트, >= 0 정수). */
  readonly recent30dTrades: number
}

/**
 * 상장 조건 4종을 판정해 **미달 조건 목록**을 반환한다.
 *
 * 근거: docs/design/08-stock.md §상장 조건 — Lv.25+ · 공장 5개+ ·
 * 총자산 1억+ · 최근 30일 거래 10회+ 의 AND. 빈 배열이면 상장 가능이다.
 * 반환 순서는 설계 문서 표의 행 순서(레벨 → 공장 수 → 총자산 → 거래 활성도)로
 * 고정한다 — UI 안내 메시지 순서의 결정성 보장.
 *
 * @param input 유저 지표 4종 (호출자 집계)
 * @returns 미달 조건 코드 목록 (빈 배열 = 상장 가능)
 * @throws {RangeError} 음수·비정수(level/factoryCount/recent30dTrades) 또는
 *   totalAssets 음수 입력 시
 */
export function checkListingConditions(
  input: ListingConditionInput,
): readonly ListingConditionFailure[] {
  const { level, factoryCount, totalAssets, recent30dTrades } = input

  assertNonNegativeInteger(level, 'level')
  assertNonNegativeInteger(factoryCount, 'factoryCount')
  assertNonNegativeInteger(recent30dTrades, 'recent30dTrades')
  if (totalAssets < 0n) {
    throw new RangeError(`totalAssets must be >= 0, got ${totalAssets}`)
  }

  const failures: ListingConditionFailure[] = []
  if (level < LISTING_MIN_LEVEL) failures.push('LEVEL')
  if (factoryCount < LISTING_MIN_FACTORY_COUNT) failures.push('FACTORY_COUNT')
  if (totalAssets < LISTING_MIN_TOTAL_ASSETS) failures.push('TOTAL_ASSETS')
  if (recent30dTrades < LISTING_MIN_RECENT_30D_TRADES) failures.push('RECENT_30D_TRADES')
  return failures
}

/** 음수/비정수 방어 — 실패 시 RangeError. */
function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${value}`)
  }
}
