import type { MaterialBag, MaterialType } from '../types'

export interface WarehouseUpgradeCost {
  readonly money: bigint
  readonly material: MaterialType
  readonly amount: bigint
}

export const WAREHOUSE_CAPACITY: Readonly<Record<number, bigint>> = {
  1: 1_000n,
  2: 3_000n,
  3: 9_000n,
  4: 27_000n,
  5: 81_000n,
  6: 200_000n,
  7: 500_000n,
  8: 1_000_000n,
  9: 10_000_000n,
  10: 100_000_000n,
}

export const WAREHOUSE_UPGRADE_COST: Readonly<Record<number, WarehouseUpgradeCost>> = {
  2: { money: 5_000n, material: 'WOOD', amount: 100n },
  3: { money: 15_000n, material: 'WOOD', amount: 300n },
  4: { money: 50_000n, material: 'WOOD', amount: 1_000n },
  5: { money: 150_000n, material: 'STEEL', amount: 200n },
  6: { money: 500_000n, material: 'STEEL', amount: 500n },
  7: { money: 1_500_000n, material: 'STEEL', amount: 1_500n },
  8: { money: 5_000_000n, material: 'CAR', amount: 10n },
  9: { money: 15_000_000n, material: 'CAR', amount: 30n },
  10: { money: 50_000_000n, material: 'CAR', amount: 50n },
}

export function capacityOf(grade: number): bigint {
  if (grade < 1 || grade > 10) {
    throw new RangeError('grade out of 1..10')
  }
  return WAREHOUSE_CAPACITY[grade]!
}

export function upgradeCostOf(toGrade: number): WarehouseUpgradeCost {
  if (toGrade < 2 || toGrade > 10) {
    throw new RangeError('toGrade out of 2..10')
  }
  return WAREHOUSE_UPGRADE_COST[toGrade]!
}

export function computeUsed(stacks: MaterialBag): bigint {
  return Object.values(stacks).reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
}

export function computeFree(grade: number, stacks: MaterialBag): bigint {
  const capacity = capacityOf(grade)
  const used = computeUsed(stacks)
  return used >= capacity ? 0n : capacity - used
}

export function isFull(grade: number, stacks: MaterialBag): boolean {
  return computeFree(grade, stacks) === 0n
}
