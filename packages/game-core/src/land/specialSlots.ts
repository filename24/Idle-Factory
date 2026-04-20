/**
 * 토지 특수 슬롯 생성 로직.
 *
 * 근거: `docs/design/11-land.md` §특수 슬롯 생성 규칙.
 * 테스트 결정성을 위해 RNG를 주입 가능하게 설계했다.
 */

import type { SlotType } from '../types'

/** 0 이상 1 미만의 실수를 반환하는 RNG. `Math.random` 호환. */
export type SlotGenRng = () => number

/**
 * 특수 슬롯 후보 타입(일반 `NORMAL` 제외).
 * `SlotType`에서 파생하며 순서·개수가 바뀌면 확률 분포에 영향을 준다.
 */
export const SPECIAL_SLOT_TYPES = [
  'ORE',
  'FERTILE',
  'FOREST',
  'OIL',
  'WATER',
] as const satisfies readonly SlotType[]

/** 각 셀이 특수 슬롯이 될 기본 확률 (15%). */
export const SPECIAL_SLOT_PROBABILITY = 0.15
/** 같은 토지 안에서 한 특수 슬롯 타입이 등장할 수 있는 최대 개수. */
export const MAX_PER_SPECIAL_TYPE = 2

/** `SPECIAL_SLOT_TYPES` 원소를 좁힌 내부 타입. */
type SpecialSlotType = (typeof SPECIAL_SLOT_TYPES)[number]

/**
 * `generateSlotTypes` 입력 파라미터.
 */
export interface GenerateSlotTypesParams {
  /** 토지 너비 */
  readonly width: number
  /** 토지 높이 */
  readonly height: number
  /** RNG (테스트용 주입). 기본값은 `Math.random`. */
  readonly rng?: SlotGenRng
}

/**
 * 주어진 크기의 토지 슬롯 타입 2차원 배열을 생성한다.
 *
 * 규칙:
 *  - 각 셀은 확률 `SPECIAL_SLOT_PROBABILITY`로 특수 슬롯 후보가 된다.
 *  - 각 특수 타입은 `MAX_PER_SPECIAL_TYPE` 한도를 넘지 못한다.
 *  - 한도 초과 타입만 남았을 때는 해당 셀을 `NORMAL`로 둔다.
 *
 * 반환 배열은 `grid[y][x]` 인덱싱이다.
 *
 * @param params 입력 파라미터
 * @returns `height × width` 크기의 슬롯 타입 그리드
 */
export function generateSlotTypes(params: GenerateSlotTypesParams): SlotType[][] {
  const { width, height } = params
  const rng = params.rng ?? Math.random

  const grid: SlotType[][] = []
  for (let y = 0; y < height; y++) {
    const row: SlotType[] = []
    for (let x = 0; x < width; x++) {
      row.push('NORMAL')
    }
    grid.push(row)
  }

  const count: Record<SpecialSlotType, number> = {
    ORE: 0,
    FERTILE: 0,
    FOREST: 0,
    OIL: 0,
    WATER: 0,
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rng() >= SPECIAL_SLOT_PROBABILITY) continue

      const available = SPECIAL_SLOT_TYPES.filter((t) => count[t] < MAX_PER_SPECIAL_TYPE)
      if (available.length === 0) continue

      const raw = Math.floor(rng() * available.length)
      const idx = raw < 0 ? 0 : raw >= available.length ? available.length - 1 : raw
      const picked = available[idx]!
      grid[y]![x] = picked
      count[picked] += 1
    }
  }

  return grid
}
