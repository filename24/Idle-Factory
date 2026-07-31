import {
  MATERIAL_TYPES,
  capacityOf,
  computeFree,
  computeUsed,
  isValidWarehouseGrade,
  type MaterialBag,
  type MaterialType,
} from '@idle/game-core'

/**
 * 창고 요약 계산 (RSC 전용 순수 함수).
 *
 * 용량·사용량은 `@idle/game-core` 의 계산기를 그대로 쓴다. 웹에서 부피 계수를
 * 다시 구현하면 봇 `/warehouse view` 와 표시값이 갈린다.
 * 근거: `docs/design/05-warehouse.md` §용량 표, §부피 계수.
 */

/** 자재별 재고 한 줄. BigInt 는 RSC 경계를 넘기 위해 문자열로 직렬화한다. */
export interface WarehouseStackSummary {
  readonly material: MaterialType
  /** 보유 개수 (정수 문자열). */
  readonly count: string
}

/** 대시보드 창고 요약 DTO. BigInt 필드는 전부 문자열이다. */
export interface WarehouseSummary {
  readonly grade: number
  /** 전체 용량 (슬롯, 정수 문자열). */
  readonly capacity: string
  /** 사용 중 용량 — 개수 합이 아니라 `개수 × 부피 계수` 합(슬롯). */
  readonly used: string
  /** 남은 용량 (슬롯, 정수 문자열). */
  readonly free: string
  /** 사용률 0~100 (정수). */
  readonly usedPercent: number
  /** 잔량이 있는 자재만, 자재 선언 순서로 정렬. */
  readonly stacks: WarehouseStackSummary[]
}

/** `MaterialType` → 표시 순서 인덱스. */
const ORDER: ReadonlyMap<MaterialType, number> = new Map(
  MATERIAL_TYPES.map((material, index) => [material, index] as const),
)

/** 정렬 순서를 모르는 자재를 목록 맨 뒤로 보내기 위한 순위. */
const UNKNOWN_ORDER = MATERIAL_TYPES.length

/** 창고 재고 행에서 요약 계산에 필요한 최소 형태. */
export interface WarehouseStackRow {
  readonly material: MaterialType
  readonly count: bigint
}

/**
 * 창고 등급과 재고 행으로 대시보드용 요약을 만든다.
 *
 * 유효 범위를 벗어난 등급이면 `capacityOf` 의 `RangeError` 가 RSC 로 전파되어
 * 대시보드 전체가 오류 화면으로 떨어지므로, 그 전에 `null` 로 방어한다.
 *
 * @param grade 창고 등급 (1..10)
 * @param stacks 창고 재고 행 (BigInt count)
 * @returns 요약 DTO, 등급이 유효 범위를 벗어나면 `null`
 */
export function computeWarehouseSummary(
  grade: number,
  stacks: readonly WarehouseStackRow[],
): WarehouseSummary | null {
  if (!isValidWarehouseGrade(grade)) return null

  const bag: MaterialBag = {}
  for (const stack of stacks) {
    bag[stack.material] = (bag[stack.material] ?? 0n) + stack.count
  }

  const capacity = capacityOf(grade)
  const used = computeUsed(bag)
  const usedPercent =
    capacity > 0n ? Math.max(0, Math.min(100, Number((used * 100n) / capacity))) : 0

  const visible = stacks
    .filter((stack) => stack.count > 0n)
    .slice()
    .sort(
      (a, b) => (ORDER.get(a.material) ?? UNKNOWN_ORDER) - (ORDER.get(b.material) ?? UNKNOWN_ORDER),
    )
    .map((stack) => ({ material: stack.material, count: stack.count.toString() }))

  return {
    grade,
    capacity: capacity.toString(),
    used: used.toString(),
    free: computeFree(grade, bag).toString(),
    usedPercent,
    stacks: visible,
  }
}
