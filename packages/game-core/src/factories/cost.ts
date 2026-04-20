/**
 * 공장 비용 계산 모음.
 *
 * 공식 근거: `docs/design/03-factories.md` §업그레이드 비용,
 *           `docs/design/11-land.md` §토지 확장.
 */

import type { FactoryType, MaterialType } from '../types'
import { FACTORY_CATALOG, getFactoryEntry } from './catalog'

/** 등급 최소값 */
const MIN_GRADE = 1
/** 등급 최대값 */
const MAX_GRADE = 10
/** 업그레이드 출발 등급 최소값 (from-grade) */
const MIN_FROM_GRADE = 1
/** 업그레이드 출발 등급 최대값: 9에서 10으로 올리는 것이 마지막 */
const MAX_FROM_GRADE = 9
/** 최초 확장 슬롯 번호(기본 3×3=9 이후 10번째 슬롯부터 확장). */
const MIN_EXPANSION_SLOT = 10
/** 10번째 슬롯 확장의 기준 비용 (화폐). */
const BASE_EXPANSION_COST = 1_000_000

/** 이동 비용 비율 (건설비의 25%). */
const MOVE_COST_NUM = 25n
/** 철거 환급 비율 (건설비의 50%). */
const DESTROY_REFUND_NUM = 50n
/** 백분율 계산용 분모. */
const PERCENT_DEN = 100n

/**
 * bigint 거듭제곱 (Math.pow는 Number 정밀도 한계 회피용).
 *
 * @param base 밑
 * @param exponent 지수 (음이 아닌 정수)
 * @returns `base ** exponent`
 */
function bigintPow(base: bigint, exponent: number): bigint {
  let result = 1n
  for (let i = 0; i < exponent; i++) {
    result *= base
  }
  return result
}

/** from-grade가 1..9 범위의 정수인지 검증. 아니면 RangeError. */
function assertFromGrade(fromGrade: number): void {
  if (!Number.isInteger(fromGrade) || fromGrade < MIN_FROM_GRADE || fromGrade > MAX_FROM_GRADE) {
    throw new RangeError('grade out of 1..9')
  }
}

/** fromGrade < toGrade이고 둘 다 1..10 범위의 정수인지 검증. */
function assertGradeRange(fromGrade: number, toGrade: number): void {
  if (
    !Number.isInteger(fromGrade) ||
    !Number.isInteger(toGrade) ||
    fromGrade < MIN_GRADE ||
    toGrade > MAX_GRADE ||
    fromGrade >= toGrade
  ) {
    throw new RangeError('grade out of 1..10')
  }
}

/**
 * 새 등급 1 공장을 건설하는 데 드는 화폐 비용.
 *
 * @param type 공장 종류
 * @returns 건설 비용 (bigint)
 */
export function buildCost(type: FactoryType): bigint {
  return getFactoryEntry(type).buildCost
}

/**
 * 등급 N → N+1 업그레이드 화폐 비용.
 *
 * 공식: `cost = buildCost × 3^N`. N ∈ [1..9].
 * 근거: `docs/design/03-factories.md` §업그레이드 비용.
 *
 * @param type 공장 종류
 * @param fromGrade 현재 등급 (1..9)
 * @returns 업그레이드 비용 (bigint)
 * @throws {RangeError} fromGrade가 1..9를 벗어난 경우
 */
export function upgradeMoneyCost(type: FactoryType, fromGrade: number): bigint {
  assertFromGrade(fromGrade)
  return buildCost(type) * bigintPow(3n, fromGrade)
}

/** 기존 호출자 호환을 위한 별칭. 신규 코드는 `upgradeMoneyCost` 사용. */
export const upgradeCost = upgradeMoneyCost

/**
 * 등급 N → N+1 업그레이드에 필요한 원료 비용.
 *
 * 공식: `amount = upgradeMaterialBase.amount × 2^N`. N ∈ [1..9].
 * 근거: `docs/design/03-factories.md` §업그레이드 비용.
 *
 * @param type 공장 종류
 * @param fromGrade 현재 등급 (1..9)
 * @returns 요구 원료 종류와 수량
 * @throws {RangeError} fromGrade가 1..9를 벗어난 경우
 */
export function upgradeMaterialCost(
  type: FactoryType,
  fromGrade: number,
): { material: MaterialType; amount: bigint } {
  assertFromGrade(fromGrade)
  const base = FACTORY_CATALOG[type].upgradeMaterialBase
  return {
    material: base.material,
    amount: base.amount * bigintPow(2n, fromGrade),
  }
}

/**
 * `fromGrade → toGrade` 누적 업그레이드 화폐 비용 (각 단계 합계).
 *
 * 제약: `1 ≤ fromGrade < toGrade ≤ 10`.
 *
 * @param type 공장 종류
 * @param fromGrade 시작 등급
 * @param toGrade 목표 등급 (fromGrade 초과)
 * @returns 누적 비용 (bigint)
 * @throws {RangeError} 등급 범위가 유효하지 않을 경우
 */
export function cumulativeUpgradeCost(
  type: FactoryType,
  fromGrade: number,
  toGrade: number,
): bigint {
  assertGradeRange(fromGrade, toGrade)
  let total = 0n
  for (let g = fromGrade; g < toGrade; g++) {
    total += upgradeMoneyCost(type, g)
  }
  return total
}

/**
 * 공장 이동 비용. 건설비의 25% (소수점 내림).
 *
 * @param type 공장 종류
 * @returns 이동 비용 (bigint)
 */
export function moveCost(type: FactoryType): bigint {
  return (buildCost(type) * MOVE_COST_NUM) / PERCENT_DEN
}

/**
 * 공장 철거 환급액. 건설비의 50% (소수점 내림).
 *
 * @param type 공장 종류
 * @returns 환급액 (bigint)
 */
export function destroyRefund(type: FactoryType): bigint {
  return (buildCost(type) * DESTROY_REFUND_NUM) / PERCENT_DEN
}

/**
 * 토지 N번째 슬롯 확장 비용.
 *
 * 공식: `cost = 1_000_000 × 1.5^(slotNumber - 10)` (내림).
 * slotNumber는 10 이상 (기본 3×3 = 9슬롯 이후가 첫 확장).
 * 근거: `docs/design/11-land.md` §토지 확장.
 *
 * @param slotNumber 확장하려는 슬롯 번호 (>= 10)
 * @returns 확장 비용 (bigint)
 * @throws {RangeError} slotNumber가 10 미만이거나 정수가 아닌 경우
 */
export function expansionSlotCost(slotNumber: number): bigint {
  if (!Number.isInteger(slotNumber) || slotNumber < MIN_EXPANSION_SLOT) {
    throw new RangeError(
      `slotNumber must be an integer >= ${MIN_EXPANSION_SLOT}, got ${slotNumber}`,
    )
  }
  const exponent = slotNumber - MIN_EXPANSION_SLOT
  const raw = BASE_EXPANSION_COST * Math.pow(1.5, exponent)
  return BigInt(Math.floor(raw))
}
