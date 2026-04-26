/**
 * 창고 용량·업그레이드 비용 계산.
 *
 * 수치 출처: `docs/design/05-warehouse.md` §용량 표, §업그레이드 비용.
 */

import type { MaterialBag, MaterialType } from '../types'

/**
 * 창고 업그레이드 단계별 비용 엔트리.
 */
export interface WarehouseUpgradeCost {
  /** 화폐 비용 (bigint) */
  readonly money: bigint
  /** 추가로 요구되는 원료 종류 */
  readonly material: MaterialType
  /** 요구 원료 수량 */
  readonly amount: bigint
}

/**
 * 창고 등급별 최대 저장 용량 (슬롯 수 단위).
 *
 * 수치는 `docs/design/05-warehouse.md` §용량 표를 그대로 반영.
 * 등급 1을 기준으로 등급당 ×3 스케일링 (`3_000 × 3^(grade-1)`).
 */
export const WAREHOUSE_CAPACITY: Readonly<Record<number, bigint>> = {
  1: 3_000n,
  2: 9_000n,
  3: 27_000n,
  4: 81_000n,
  5: 243_000n,
  6: 729_000n,
  7: 2_187_000n,
  8: 6_561_000n,
  9: 19_683_000n,
  10: 59_049_000n,
}

/**
 * 창고 등급별 업그레이드(다음 등급으로 올리는) 비용 테이블.
 *
 * 키는 목표 등급(2..10). 원료 종류는 단계별로 다르다
 * (초반 WOOD → 중반 STEEL → 후반 CAR).
 * 수치 출처: `docs/design/05-warehouse.md` §업그레이드 비용.
 */
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

/**
 * 주어진 등급의 창고 용량.
 *
 * @param grade 창고 등급 (1..10)
 * @returns 용량 (bigint)
 * @throws {RangeError} 등급이 1..10을 벗어난 경우
 */
export function capacityOf(grade: number): bigint {
  if (grade < 1 || grade > 10) {
    throw new RangeError('grade out of 1..10')
  }
  return WAREHOUSE_CAPACITY[grade]!
}

/**
 * 목표 등급으로 업그레이드하는 데 드는 비용.
 *
 * @param toGrade 업그레이드 목표 등급 (2..10)
 * @returns 화폐+원료 비용 정보
 * @throws {RangeError} toGrade가 2..10을 벗어난 경우
 */
export function upgradeCostOf(toGrade: number): WarehouseUpgradeCost {
  if (toGrade < 2 || toGrade > 10) {
    throw new RangeError('toGrade out of 2..10')
  }
  return WAREHOUSE_UPGRADE_COST[toGrade]!
}

/**
 * 현재 창고에 쌓인 총량 (자원 종류 합).
 *
 * @param stacks 자원 묶음
 * @returns 사용 중 용량 (bigint)
 */
export function computeUsed(stacks: MaterialBag): bigint {
  return Object.values(stacks).reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
}

/**
 * 남은 여유 용량. `capacity - used`, 음수는 0으로 클램프.
 *
 * @param grade 창고 등급
 * @param stacks 현재 자원 묶음
 * @returns 여유 용량 (bigint, 0 이상)
 * @throws {RangeError} grade가 1..10을 벗어난 경우
 */
export function computeFree(grade: number, stacks: MaterialBag): bigint {
  const capacity = capacityOf(grade)
  const used = computeUsed(stacks)
  return used >= capacity ? 0n : capacity - used
}

/**
 * 창고가 가득 찼는지 여부.
 *
 * @param grade 창고 등급
 * @param stacks 현재 자원 묶음
 * @returns 여유 용량이 0이면 true
 */
export function isFull(grade: number, stacks: MaterialBag): boolean {
  return computeFree(grade, stacks) === 0n
}
