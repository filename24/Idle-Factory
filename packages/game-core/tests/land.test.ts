import { describe, expect, it } from 'vitest'
import { canPlace, getOccupiedCells, getSpecialSlotBonus } from '../src/land/layout'
import { generateSlotTypes, SPECIAL_SLOT_TYPES } from '../src/land/specialSlots'
import type { SlotState, SlotType } from '../src/types'

const seq = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]!
}

const slot = (x: number, y: number, overrides: Partial<SlotState> = {}): SlotState => ({
  x,
  y,
  type: 'NORMAL',
  factoryId: null,
  locked: false,
  ...overrides,
})

describe('canPlace', () => {
  it('allows FARM(1x1) at (0,0) on empty 3x3 land', () => {
    const result = canPlace({
      landWidth: 3,
      landHeight: 3,
      slots: [],
      type: 'FARM',
      anchorX: 0,
      anchorY: 0,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects FARM at (3,0) on 3x3 as OUT_OF_BOUNDS', () => {
    const result = canPlace({
      landWidth: 3,
      landHeight: 3,
      slots: [],
      type: 'FARM',
      anchorX: 3,
      anchorY: 0,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('OUT_OF_BOUNDS')
  })

  it('rejects CAR_FACTORY(2x2) at (2,0) on 3x3 as OUT_OF_BOUNDS', () => {
    const result = canPlace({
      landWidth: 3,
      landHeight: 3,
      slots: [],
      type: 'CAR_FACTORY',
      anchorX: 2,
      anchorY: 0,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('OUT_OF_BOUNDS')
  })

  it('allows CAR_FACTORY(2x2) at (0,0) on 3x3', () => {
    const result = canPlace({
      landWidth: 3,
      landHeight: 3,
      slots: [],
      type: 'CAR_FACTORY',
      anchorX: 0,
      anchorY: 0,
    })
    expect(result.ok).toBe(true)
  })

  it('rejects FARM at (1,1) when that slot is occupied', () => {
    const result = canPlace({
      landWidth: 3,
      landHeight: 3,
      slots: [slot(1, 1, { factoryId: 'factory-x' })],
      type: 'FARM',
      anchorX: 1,
      anchorY: 1,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('OCCUPIED')
    expect(result.blockingSlot).toEqual({ x: 1, y: 1 })
  })

  it('rejects FARM on a locked slot as LOCKED (takes precedence over OCCUPIED)', () => {
    const result = canPlace({
      landWidth: 4,
      landHeight: 4,
      slots: [slot(3, 0, { locked: true })],
      type: 'FARM',
      anchorX: 3,
      anchorY: 0,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('LOCKED')
    expect(result.blockingSlot).toEqual({ x: 3, y: 0 })
  })

  it('rejects T3 2x2 placement when any corner overlaps a locked slot', () => {
    // 3x3 active + 7 locked (4x4). Anchor at (2,2) — bottom-right 2x2 covers (3,2), (2,3), (3,3) which are all locked.
    const lockedSlots: SlotState[] = []
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        if (x >= 3 || y >= 3) lockedSlots.push(slot(x, y, { locked: true }))
      }
    }
    const result = canPlace({
      landWidth: 4,
      landHeight: 4,
      slots: lockedSlots,
      type: 'CAR_FACTORY',
      anchorX: 2,
      anchorY: 2,
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('LOCKED')
  })
})

describe('getSpecialSlotBonus', () => {
  it('returns 1.2 for FARM on FERTILE', () => {
    expect(getSpecialSlotBonus('FERTILE', 'FARM')).toBe(1.2)
  })

  it('returns 1.2 for MINE on ORE', () => {
    expect(getSpecialSlotBonus('ORE', 'MINE')).toBe(1.2)
  })

  it('returns 1.3 for OIL_WELL on OIL', () => {
    expect(getSpecialSlotBonus('OIL', 'OIL_WELL')).toBe(1.3)
  })

  it('returns 1.0 for FARM on NORMAL', () => {
    expect(getSpecialSlotBonus('NORMAL', 'FARM')).toBe(1.0)
  })

  it('returns 1.0 for FARM on WATER (adjacency, not direct)', () => {
    expect(getSpecialSlotBonus('WATER', 'FARM')).toBe(1.0)
  })

  it('returns 1.0 for MINE on FERTILE (mismatched)', () => {
    expect(getSpecialSlotBonus('FERTILE', 'MINE')).toBe(1.0)
  })
})

describe('getOccupiedCells', () => {
  it('returns all 4 cells of a 2x2 anchored at (1,2)', () => {
    const cells = getOccupiedCells(1, 2, 2, 2)
    expect(cells).toHaveLength(4)
    expect(cells).toEqual(
      expect.arrayContaining([
        { x: 1, y: 2 },
        { x: 2, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 3 },
      ]),
    )
  })
})

describe('generateSlotTypes', () => {
  it('returns a grid with correct dimensions', () => {
    const grid = generateSlotTypes({
      width: 4,
      height: 3,
      rng: () => 0.99,
    })
    expect(grid).toHaveLength(3)
    expect(grid[0]).toHaveLength(4)
  })

  it('produces all NORMAL when rng always returns 0.5', () => {
    const grid = generateSlotTypes({
      width: 3,
      height: 3,
      rng: () => 0.5,
    })
    for (const row of grid) {
      for (const cell of row) {
        expect(cell).toBe('NORMAL')
      }
    }
  })

  it('caps each special type at 2 when rng always returns 0', () => {
    const grid = generateSlotTypes({
      width: 3,
      height: 3,
      rng: () => 0,
    })
    const flat = grid.flat()
    const counts: Record<string, number> = {}
    for (const cell of flat) {
      counts[cell] = (counts[cell] ?? 0) + 1
    }
    expect(counts.ORE).toBe(2)
    expect(counts.FERTILE).toBe(2)
    expect(counts.FOREST).toBe(2)
    expect(counts.OIL).toBe(2)
    expect(counts.WATER).toBe(1)
    for (const t of SPECIAL_SLOT_TYPES) {
      expect(counts[t] ?? 0).toBeLessThanOrEqual(2)
    }
  })

  it('uses deterministic seq rng', () => {
    const rng = seq([0.1, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99])
    const grid = generateSlotTypes({ width: 2, height: 2, rng })
    const flat = grid.flat()
    const specials = flat.filter((c: SlotType) => c !== 'NORMAL')
    expect(specials.length).toBe(1)
    expect(specials[0]).toBe('ORE')
  })

  it('does not throw when rng is omitted (smoke)', () => {
    expect(() => generateSlotTypes({ width: 3, height: 3 })).not.toThrow()
  })
})
