import type { SlotType } from '../types'

export type SlotGenRng = () => number

export const SPECIAL_SLOT_TYPES = [
  'ORE',
  'FERTILE',
  'FOREST',
  'OIL',
  'WATER',
] as const satisfies readonly SlotType[]

export const SPECIAL_SLOT_PROBABILITY = 0.15
export const MAX_PER_SPECIAL_TYPE = 2

type SpecialSlotType = (typeof SPECIAL_SLOT_TYPES)[number]

export interface GenerateSlotTypesParams {
  readonly width: number
  readonly height: number
  readonly rng?: SlotGenRng
}

export function generateSlotTypes(
  params: GenerateSlotTypesParams,
): SlotType[][] {
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

      const available = SPECIAL_SLOT_TYPES.filter(
        (t) => count[t] < MAX_PER_SPECIAL_TYPE,
      )
      if (available.length === 0) continue

      const raw = Math.floor(rng() * available.length)
      const idx =
        raw < 0 ? 0 : raw >= available.length ? available.length - 1 : raw
      const picked = available[idx]!
      grid[y]![x] = picked
      count[picked] += 1
    }
  }

  return grid
}
