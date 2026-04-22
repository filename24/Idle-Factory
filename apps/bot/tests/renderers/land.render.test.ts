/**
 * LandRenderer 순수 유닛 테스트.
 *
 * DB/Prisma 의존 없음. 입력 DTO → 출력 문자열만 검증.
 */

import { describe, expect, it } from 'vitest'

import {
  renderCells,
  renderLand,
  toSuperscript,
  type FactoryDTO,
  type SlotDTO
} from '../../src/structures/renderers/LandRenderer'

/** 가로 `w` × 세로 `h` 전체 NORMAL 슬롯 배열 생성 헬퍼. */
function makeEmptySlots(w: number, h: number): SlotDTO[] {
  const out: SlotDTO[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out.push({ x, y, type: 'NORMAL' })
    }
  }
  return out
}

describe('toSuperscript', () => {
  it('maps single digits 1..9', () => {
    expect(toSuperscript(1)).toBe('¹')
    expect(toSuperscript(5)).toBe('⁵')
    expect(toSuperscript(9)).toBe('⁹')
  })

  it('maps 10 as "¹⁰"', () => {
    expect(toSuperscript(10)).toBe('¹⁰')
  })

  it('handles 0 as "⁰"', () => {
    expect(toSuperscript(0)).toBe('⁰')
  })

  it('returns empty string for negatives or non-finite', () => {
    expect(toSuperscript(-1)).toBe('')
    expect(toSuperscript(Number.NaN)).toBe('')
    expect(toSuperscript(Number.POSITIVE_INFINITY)).toBe('')
  })
})

describe('renderLand - empty land', () => {
  it('renders 4×4 empty NORMAL land as sixteen ⬜', () => {
    const { grid, legend } = renderLand(
      { width: 4, height: 4 },
      [],
      makeEmptySlots(4, 4)
    )
    expect(grid).toBe('⬜⬜⬜⬜\n⬜⬜⬜⬜\n⬜⬜⬜⬜\n⬜⬜⬜⬜')
    expect(legend).toContain('⬜')
  })

  it('renders empty with no slot entries (defaults to empty cell)', () => {
    const { grid } = renderLand({ width: 2, height: 1 }, [], [])
    expect(grid).toBe('⬜⬜')
  })
})

describe('renderLand - factories', () => {
  it('renders a 1×1 FARM G1 with 🌾¹', () => {
    const factory: FactoryDTO = {
      type: 'FARM',
      grade: 1,
      anchorX: 1,
      anchorY: 1
    }
    const { grid } = renderLand(
      { width: 3, height: 3 },
      [factory],
      makeEmptySlots(3, 3)
    )
    const rows = grid.split('\n')
    expect(rows[0]).toBe('⬜⬜⬜')
    expect(rows[1]).toBe('⬜🌾¹⬜')
    expect(rows[2]).toBe('⬜⬜⬜')
  })

  it('renders a 2×2 CAR_FACTORY with emoji on all 4 cells, grade only on anchor', () => {
    const factory: FactoryDTO = {
      type: 'CAR_FACTORY',
      grade: 3,
      anchorX: 0,
      anchorY: 0
    }
    const { grid } = renderLand(
      { width: 3, height: 3 },
      [factory],
      makeEmptySlots(3, 3)
    )
    const rows = grid.split('\n')
    expect(rows[0]).toBe('🚗³🚗⬜')
    expect(rows[1]).toBe('🚗🚗⬜')
    expect(rows[2]).toBe('⬜⬜⬜')
  })

  it('renders a G10 factory with ¹⁰ superscript', () => {
    const factory: FactoryDTO = {
      type: 'MINE',
      grade: 10,
      anchorX: 0,
      anchorY: 0
    }
    const { grid } = renderLand(
      { width: 1, height: 1 },
      [factory],
      makeEmptySlots(1, 1)
    )
    expect(grid).toBe('⛏️¹⁰')
  })
})

describe('renderLand - special slots', () => {
  it('maps each special slot type to its emoji', () => {
    const slots: SlotDTO[] = [
      { x: 0, y: 0, type: 'FERTILE' },
      { x: 1, y: 0, type: 'FOREST' },
      { x: 2, y: 0, type: 'OIL' },
      { x: 3, y: 0, type: 'ORE' },
      { x: 4, y: 0, type: 'WATER' }
    ]
    const { grid } = renderLand({ width: 5, height: 1 }, [], slots)
    expect(grid).toBe('🌱🌳🛢️🪨💧')
  })

  it('prefers factory over special slot when both defined at same cell', () => {
    const slots: SlotDTO[] = [{ x: 0, y: 0, type: 'FERTILE' }]
    const factory: FactoryDTO = {
      type: 'FARM',
      grade: 2,
      anchorX: 0,
      anchorY: 0
    }
    const { grid } = renderLand({ width: 1, height: 1 }, [factory], slots)
    expect(grid).toBe('🌾²')
  })
})

describe('renderCells', () => {
  it('returns y-major order with width*height entries', () => {
    const cells = renderCells({ width: 2, height: 3 }, [], makeEmptySlots(2, 3))
    expect(cells).toHaveLength(6)
    expect(cells[0]).toMatchObject({ x: 0, y: 0 })
    expect(cells[1]).toMatchObject({ x: 1, y: 0 })
    expect(cells[2]).toMatchObject({ x: 0, y: 1 })
    expect(cells[5]).toMatchObject({ x: 1, y: 2 })
  })

  it('marks empty NORMAL slots as kind=empty', () => {
    const cells = renderCells(
      { width: 1, height: 1 },
      [],
      [{ x: 0, y: 0, type: 'NORMAL' }]
    )
    expect(cells[0]).toMatchObject({
      kind: 'empty',
      emoji: '⬜',
      text: '⬜'
    })
  })

  it('marks special slots with slotType + kind=special', () => {
    const cells = renderCells(
      { width: 1, height: 1 },
      [],
      [{ x: 0, y: 0, type: 'FERTILE' }]
    )
    expect(cells[0]).toMatchObject({
      kind: 'special',
      emoji: '🌱',
      slotType: 'FERTILE'
    })
  })

  it('marks factory anchor with text including grade superscript', () => {
    const cells = renderCells(
      { width: 1, height: 1 },
      [{ type: 'FARM', grade: 3, anchorX: 0, anchorY: 0 }],
      makeEmptySlots(1, 1)
    )
    expect(cells[0]).toMatchObject({
      kind: 'factory-anchor',
      emoji: '🌾',
      text: '🌾³'
    })
    expect(cells[0]?.factory).toMatchObject({ type: 'FARM', grade: 3 })
  })

  it('marks 2×2 factory body cells as factory-body without grade on text', () => {
    const factory: FactoryDTO = {
      type: 'CAR_FACTORY',
      grade: 4,
      anchorX: 0,
      anchorY: 0
    }
    const cells = renderCells(
      { width: 2, height: 2 },
      [factory],
      makeEmptySlots(2, 2)
    )
    // anchor (0,0) gets superscript; body cells show emoji only.
    const byPos = (x: number, y: number) =>
      cells.find((c) => c.x === x && c.y === y)!
    expect(byPos(0, 0).kind).toBe('factory-anchor')
    expect(byPos(0, 0).text).toMatch(/⁴$/)
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [1, 1]
    ] as const) {
      const cell = byPos(x, y)
      expect(cell.kind).toBe('factory-body')
      expect(cell.text).toBe(cell.emoji)
      expect(cell.factory).toMatchObject({ type: 'CAR_FACTORY', grade: 4 })
    }
  })
})
