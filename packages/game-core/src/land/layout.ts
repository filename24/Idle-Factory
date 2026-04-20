import { FACTORY_CATALOG } from '../factories/catalog'
import type { FactoryType, SlotState, SlotType } from '../types'

export type PlacementFailureReason = 'OUT_OF_BOUNDS' | 'LOCKED_SLOT' | 'OCCUPIED' | 'OVERLAP'

export interface PlacementCheckResult {
  readonly ok: boolean
  readonly reason?: PlacementFailureReason
  readonly blockingSlot?: { x: number; y: number }
}

export interface CanPlaceParams {
  readonly landWidth: number
  readonly landHeight: number
  readonly slots: readonly SlotState[]
  readonly type: FactoryType
  readonly anchorX: number
  readonly anchorY: number
}

export function getOccupiedCells(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: anchorX + dx, y: anchorY + dy })
    }
  }
  return cells
}

export function canPlace(params: CanPlaceParams): PlacementCheckResult {
  const { landWidth, landHeight, slots, type, anchorX, anchorY } = params
  const { width, height } = FACTORY_CATALOG[type].size

  if (anchorX < 0 || anchorY < 0 || anchorX + width > landWidth || anchorY + height > landHeight) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' }
  }

  const cells = getOccupiedCells(anchorX, anchorY, width, height)
  for (const cell of cells) {
    const slot = slots.find((s) => s.x === cell.x && s.y === cell.y)
    if (slot === undefined) continue
    if (slot.locked) {
      return {
        ok: false,
        reason: 'LOCKED_SLOT',
        blockingSlot: { x: slot.x, y: slot.y },
      }
    }
    if (slot.factoryId !== null) {
      return {
        ok: false,
        reason: 'OCCUPIED',
        blockingSlot: { x: slot.x, y: slot.y },
      }
    }
  }

  return { ok: true }
}

const DIRECT_BONUS_MAP: Readonly<Partial<Record<FactoryType, { slot: SlotType; bonus: number }>>> =
  {
    FARM: { slot: 'FERTILE', bonus: 1.2 },
    MINE: { slot: 'ORE', bonus: 1.2 },
    LUMBER: { slot: 'FOREST', bonus: 1.2 },
    OIL_WELL: { slot: 'OIL', bonus: 1.3 },
  }

export function getSpecialSlotBonus(slotType: SlotType, factoryType: FactoryType): number {
  const entry = DIRECT_BONUS_MAP[factoryType]
  if (entry !== undefined && entry.slot === slotType) {
    return entry.bonus
  }
  return 1.0
}
