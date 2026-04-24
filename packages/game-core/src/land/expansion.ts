/**
 * 토지 구역별 슬롯 확장 비용/레벨 요구 공식.
 *
 * 근거: `docs/design/11-land.md` §슬롯 확장.
 *
 * 각 토지 구역(1~5)은 3×3 (9슬롯) 으로 시작해 최대 4×4 (16슬롯) 까지
 * 잠긴 슬롯을 개별 구매하는 방식으로 확장한다. 구역 안에서의 구매 순서를
 * `k ∈ {1..7}` 로 표기한다.
 *
 * 비용 공식:
 *   cost(N, k) = 5,000 × 10^(N-1) × 2^(k-1)
 *     N: 토지 구역 번호 (1..5)
 *     k: 해당 구역 내 확장 구매 순서 (1..7)
 *
 * 레벨 요구는 docs 의 고정 테이블을 그대로 쓴다. 1번 구역은 레벨 요구 없음(0).
 */

/** 토지 구역의 최대 확장 구매 횟수 — 3×3(9) → 4×4(16) 까지 7번. */
export const MAX_EXPANSIONS_PER_LAND = 7

/** 확장 구매 순서(k) 의 최소값. */
export const MIN_EXPANSION_ORDER = 1

/** 확장 구매 순서(k) 의 최대값. */
export const MAX_EXPANSION_ORDER = MAX_EXPANSIONS_PER_LAND

/** 토지 구역 번호의 최소/최대값 (docs/11). */
const MIN_LAND_INDEX = 1
const MAX_LAND_INDEX = 5

/**
 * docs/11 §슬롯 확장 레벨 조건 표.
 *
 * `EXPANSION_LEVEL_TABLE[N-1][k-1]` = N번째 구역의 k번째 슬롯 구매에 필요한 최소 레벨.
 * 1번 구역은 레벨 요구 없음(0).
 */
const EXPANSION_LEVEL_TABLE: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 0, 0, 0, 0, 0, 0], // 1번 구역 — 골드만
  [5, 7, 10, 12, 15, 17, 20], // 2번 구역
  [20, 22, 25, 27, 30, 33, 35], // 3번 구역
  [35, 37, 40, 42, 44, 46, 48], // 4번 구역
  [48, 49, 50, 50, 50, 50, 50], // 5번 구역
]

/**
 * bigint 거듭제곱 헬퍼.
 */
function bigintPow(base: bigint, exponent: number): bigint {
  let result = 1n
  for (let i = 0; i < exponent; i++) result *= base
  return result
}

function assertLandIndex(landIndex: number): void {
  if (!Number.isInteger(landIndex) || landIndex < MIN_LAND_INDEX || landIndex > MAX_LAND_INDEX) {
    throw new RangeError(
      `landIndex must be an integer in [${MIN_LAND_INDEX}, ${MAX_LAND_INDEX}], got ${landIndex}`,
    )
  }
}

function assertExpansionOrder(k: number): void {
  if (!Number.isInteger(k) || k < MIN_EXPANSION_ORDER || k > MAX_EXPANSION_ORDER) {
    throw new RangeError(
      `expansionOrder must be an integer in [${MIN_EXPANSION_ORDER}, ${MAX_EXPANSION_ORDER}], got ${k}`,
    )
  }
}

/**
 * N번째 토지 구역의 k번째 슬롯 확장에 드는 골드 비용.
 *
 * 공식: `5,000 × 10^(N-1) × 2^(k-1)`.
 *
 * @param landIndex 토지 구역 번호 (1..5)
 * @param expansionOrder 해당 구역 내 확장 구매 순서 (1..7)
 * @returns 골드 비용 (bigint)
 * @throws {RangeError} 입력 범위 이탈 시
 */
export function landExpansionCost(landIndex: number, expansionOrder: number): bigint {
  assertLandIndex(landIndex)
  assertExpansionOrder(expansionOrder)
  const base = 5_000n
  return base * bigintPow(10n, landIndex - 1) * bigintPow(2n, expansionOrder - 1)
}

/**
 * N번째 토지 구역의 k번째 슬롯 확장에 필요한 최소 레벨.
 *
 * 1번 구역은 0을 반환(레벨 조건 없음).
 *
 * @param landIndex 토지 구역 번호 (1..5)
 * @param expansionOrder 해당 구역 내 확장 구매 순서 (1..7)
 * @returns 최소 요구 레벨 (0 이상 정수)
 * @throws {RangeError} 입력 범위 이탈 시
 */
export function landExpansionLevelRequirement(landIndex: number, expansionOrder: number): number {
  assertLandIndex(landIndex)
  assertExpansionOrder(expansionOrder)
  return EXPANSION_LEVEL_TABLE[landIndex - 1]![expansionOrder - 1]!
}

/**
 * 토지 구역 기본 치수 (docs/11 — 3×3 시작, 최대 4×4).
 */
export const LAND_INITIAL_WIDTH = 3
export const LAND_INITIAL_HEIGHT = 3
export const LAND_MAX_WIDTH = 4
export const LAND_MAX_HEIGHT = 4

/**
 * 좌표 `(x, y)` 가 초기 3×3 활성 영역 내인지 판단한다.
 *
 * 4×4 물리 그리드에서 좌상단 3×3 만 활성이고 우측 열(x=3)과 하단 행(y=3) 은 locked.
 */
export function isInitiallyActive(x: number, y: number): boolean {
  return x < LAND_INITIAL_WIDTH && y < LAND_INITIAL_HEIGHT
}
