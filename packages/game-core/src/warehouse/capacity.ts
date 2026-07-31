/**
 * 창고 용량·부피 계수·업그레이드 비용 계산.
 *
 * 수치 출처: `docs/design/05-warehouse.md` §용량 표, §부피 계수, §업그레이드 비용.
 */

import type { MaterialBag, MaterialType } from '../types'

/**
 * 자재 1 개가 차지하는 창고 슬롯 수 (부피 계수).
 *
 * 도입 배경 (#21 결정 1·4): 창고 용량은 **개수** 기준인데 T1 산출은 tick 당
 * 300~400원이 되도록 *금액* 으로 정규화되어 있어(`market/basePrices.ts`),
 * 단가가 비싼 저(低)산출 공장은 창고가 좀처럼 차지 않았다. 계수 도입 전 실측:
 * 농장 16.7시간 / 목재소 20.0시간 / **광산 33.3시간 / 유정 62.5시간** — 뒤의
 * 두 공장에는 "창고가 차면 접속하게 만든다"는 코어 루프 설계
 * (`docs/design/05-warehouse.md` §설계 의도)가 아예 작동하지 않았다.
 *
 * T1 원자재 4종에만 계수를 주고 T2·T3 는 1 로 둔다. 계수를 단가 비례로 주면
 * 원(₩)당 창고 점유가 전 자재 균일해져, 가공·완제품이 창고를 덜 잡는다는
 * T2/T3 의 존재 이유(창고 1칸당 GRAIN 10원 vs ELECTRONIC 800원)를 지워 버리기
 * 때문이다 (#21 결정 3 — 티어 수익 배수 대신 부피 효율을 T2/T3 의 가치로 확정).
 *
 * 계수 적용 후 등급1 창고 포화 (공장 1채 기준, 목표 16시간 ±25%):
 * 농장 16.7h · 광산 16.7h · 목재소 20.0h · 유정 12.5h — 4종 모두 목표 범위.
 *
 * 정수만 쓴다 — 창고 계산은 전부 `bigint` 이고 소수 계수는 정밀도 손실 없이
 * 곱할 수 없다 (패키지 규약: bigint first).
 */
export const MATERIAL_VOLUME: Readonly<Record<MaterialType, bigint>> = {
  // T1 — 원자재. 단가가 높을수록 tick 당 산출 개수가 적어 계수로 보정한다.
  GRAIN: 1n,
  ORE: 2n,
  WOOD: 1n,
  CRUDE_OIL: 5n,
  // T2 — 가공재. 계수 1 을 유지해 창고 효율 우위를 남긴다.
  STEEL: 1n,
  FUEL: 1n,
  PLASTIC: 1n,
  PROCESSED_FOOD: 1n,
  FURNITURE: 1n,
  // T3 — 완제품. 같은 이유로 1.
  CAR: 1n,
  ELECTRONIC: 1n,
  FINISHED_FOOD: 1n,
  // 특수 — T3 저확률 드롭.
  RAW_BOOSTER: 1n,
}

/**
 * 표시·순회용 자재 종류 목록 (T1 → T2 → T3 → 특수, 선언 순서).
 *
 * `MATERIAL_VOLUME` 의 키 순서를 그대로 쓴다. 배열 리터럴로 따로 적으면 자재가
 * 추가될 때 누락돼도 컴파일이 통과하지만, `Readonly<Record<MaterialType, bigint>>`
 * 의 키를 재사용하면 누락이 타입 레벨에서 원천 차단된다.
 *
 * 창고 스택 조회에는 `orderBy` 가 없어 DB 반환 순서가 비결정적이므로
 * (`apps/bot/src/services/warehouse.ts` §loadWarehouse), 재고를 나열하는 표시
 * 계층은 이 순서를 기준으로 직접 정렬한다.
 */
export const MATERIAL_TYPES: readonly MaterialType[] = Object.keys(
  MATERIAL_VOLUME,
) as MaterialType[]

/**
 * 자재의 부피 계수를 반환한다.
 *
 * @param material 자재 종류
 * @returns 1 개당 차지하는 슬롯 수 (bigint, >= 1)
 */
export function volumeOf(material: MaterialType): bigint {
  return MATERIAL_VOLUME[material]
}

/**
 * 주어진 여유 용량에 담을 수 있는 자재 **개수**.
 *
 * 창고 여유는 슬롯(부피) 단위이고 생산·드롭은 개수 단위라, 둘을 비교하는
 * 모든 지점에서 이 변환이 필요하다.
 *
 * @param material 자재 종류
 * @param free 남은 여유 용량 (슬롯)
 * @returns 담을 수 있는 최대 개수 (bigint, 0 이상)
 */
export function unitsThatFit(material: MaterialType, free: bigint): bigint {
  if (free <= 0n) return 0n
  return free / volumeOf(material)
}

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

/** 용량 테이블에 정의된 등급 목록 — 등급 범위의 단일 출처. */
const WAREHOUSE_GRADES: readonly number[] = Object.keys(WAREHOUSE_CAPACITY).map(Number)

/** 창고 등급 하한. */
export const MIN_WAREHOUSE_GRADE: number = Math.min(...WAREHOUSE_GRADES)

/** 창고 등급 상한. */
export const MAX_WAREHOUSE_GRADE: number = Math.max(...WAREHOUSE_GRADES)

/**
 * 창고 등급이 용량 테이블에 존재하는 유효 등급인지 판정한다.
 *
 * 범위를 상수로 따로 적으면 용량 테이블이 늘어날 때 표시 계층이 조용히
 * 어긋나므로(`MATERIAL_TYPES` 와 같은 이유), 테이블 자체를 기준으로 삼는다.
 *
 * @param grade 창고 등급
 * @returns 유효하면 `true` (= `capacityOf` 가 던지지 않음)
 */
export function isValidWarehouseGrade(grade: number): boolean {
  return grade >= MIN_WAREHOUSE_GRADE && grade <= MAX_WAREHOUSE_GRADE
}

/**
 * 주어진 등급의 창고 용량.
 *
 * @param grade 창고 등급 (1..10)
 * @returns 용량 (bigint)
 * @throws {RangeError} 등급이 1..10을 벗어난 경우
 */
export function capacityOf(grade: number): bigint {
  if (!isValidWarehouseGrade(grade)) {
    throw new RangeError(`grade out of ${MIN_WAREHOUSE_GRADE}..${MAX_WAREHOUSE_GRADE}`)
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
 * 현재 창고가 쓰고 있는 용량 — 자재별 **개수 × 부피 계수** 의 합.
 *
 * 개수 단순 합이 아니다: `MATERIAL_VOLUME` 이 도입된 뒤로 광석 1 개는 2 슬롯,
 * 원유 1 개는 5 슬롯을 차지한다 (#21 결정 4).
 *
 * @param stacks 자원 묶음
 * @returns 사용 중 용량 (슬롯, bigint)
 */
export function computeUsed(stacks: MaterialBag): bigint {
  return Object.entries(stacks).reduce<bigint>(
    (sum, [material, value]) => sum + (value ?? 0n) * volumeOf(material as MaterialType),
    0n,
  )
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
