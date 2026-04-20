import type { FactoryType, MaterialType } from '../types'
import { FACTORY_CATALOG, getFactoryEntry } from './catalog'

const MIN_GRADE = 1
const MAX_GRADE = 10
const MIN_FROM_GRADE = 1
const MAX_FROM_GRADE = 9
const MIN_EXPANSION_SLOT = 10
const BASE_EXPANSION_COST = 1_000_000

const MOVE_COST_NUM = 25n
const DESTROY_REFUND_NUM = 50n
const PERCENT_DEN = 100n

/** bigint exponentiation via loop (no Math.pow). */
function bigintPow(base: bigint, exponent: number): bigint {
  let result = 1n
  for (let i = 0; i < exponent; i++) {
    result *= base
  }
  return result
}

function assertFromGrade(fromGrade: number): void {
  if (!Number.isInteger(fromGrade) || fromGrade < MIN_FROM_GRADE || fromGrade > MAX_FROM_GRADE) {
    throw new RangeError('grade out of 1..9')
  }
}

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

/** Cost in money (bigint) to build a new level-1 factory of the given type. */
export function buildCost(type: FactoryType): bigint {
  return getFactoryEntry(type).buildCost
}

/**
 * Money cost to upgrade from grade N → N+1.
 *   cost = buildCost × 3^N
 * Valid for N in [1..9].
 */
export function upgradeMoneyCost(type: FactoryType, fromGrade: number): bigint {
  assertFromGrade(fromGrade)
  return buildCost(type) * bigintPow(3n, fromGrade)
}

/** Alias retained for internal callers that used the shorter name. */
export const upgradeCost = upgradeMoneyCost

/**
 * Material cost to upgrade from grade N → N+1.
 *   amount = upgradeMaterialBase.amount × 2^N
 * Valid for N in [1..9].
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
 * Cumulative money cost to upgrade from `fromGrade` to `toGrade`.
 * Requires 1 <= fromGrade < toGrade <= 10.
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

/** Cost to move a factory: 25% of build cost (floor). */
export function moveCost(type: FactoryType): bigint {
  return (buildCost(type) * MOVE_COST_NUM) / PERCENT_DEN
}

/** Refund when destroying a factory: 50% of build cost (floor). */
export function destroyRefund(type: FactoryType): bigint {
  return (buildCost(type) * DESTROY_REFUND_NUM) / PERCENT_DEN
}

/**
 * Land expansion cost for the Nth slot (N >= 10; slot 10 is the first
 * expansion slot beyond the base 3x3 grid).
 *   cost = 1_000_000 × 1.5^(slotNumber - 10), floored.
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
