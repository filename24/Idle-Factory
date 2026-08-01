/**
 * 토지 그리드 조립 검증.
 *
 * 실수하기 쉬운 지점만 골라 고정한다:
 *  - 토지는 물리적으로 4×4 지만 초기 활성 영역은 3×3 이다.
 *  - 2×2 공장은 앵커 1칸 + 덮인 3칸으로 나뉜다.
 *  - 잠금 판정이 특수 슬롯보다 **우선**한다 (잠긴 특수 슬롯은 보너스가 없다).
 *  - 보유 토지 번호는 연속이 아닐 수 있다.
 */

import { describe, expect, it } from 'vitest'
import { isInitiallyActive, LAND_MAX_HEIGHT, LAND_MAX_WIDTH } from '@idle/game-core'
import {
  buildLandGrid,
  findAdjacentLandIndices,
  type LandFactoryRow,
  type LandSlotRow,
} from '../../src/lib/land-grid'

/** 신규 유저의 초기 슬롯 배치(4×4 중 3×3 활성). */
function initialSlots(
  overrides: Partial<Record<string, Partial<LandSlotRow>>> = {},
): LandSlotRow[] {
  const slots: LandSlotRow[] = []
  for (let y = 0; y < LAND_MAX_HEIGHT; y += 1) {
    for (let x = 0; x < LAND_MAX_WIDTH; x += 1) {
      slots.push({
        x,
        y,
        type: 'NORMAL',
        locked: !isInitiallyActive(x, y),
        ...(overrides[`${x},${y}`] ?? {}),
      })
    }
  }
  return slots
}

/** 셀 조회 헬퍼. */
const cellAt = (grid: ReturnType<typeof buildLandGrid>, x: number, y: number) =>
  grid.cells.find((c) => c.x === x && c.y === y)

describe('buildLandGrid — 초기 상태', () => {
  it('4×4 = 16칸을 만든다', () => {
    const grid = buildLandGrid(initialSlots(), [])
    expect(grid.cells).toHaveLength(16)
    expect(grid.width).toBe(4)
    expect(grid.height).toBe(4)
  })

  it('초기 활성 영역은 3×3 이고 나머지 7칸은 잠겨 있다', () => {
    // 문서가 "4×4로 시작"이라 적어 온 부분이 실제와 다르다는 게 감사에서 확인됐다.
    const grid = buildLandGrid(initialSlots(), [])
    expect(grid.unlockedCount).toBe(9)
    expect(grid.lockedCount).toBe(7)
  })

  it('잠긴 칸은 LOCKED, 해금된 일반 칸은 EMPTY 다', () => {
    const grid = buildLandGrid(initialSlots(), [])
    expect(cellAt(grid, 0, 0)?.kind).toBe('EMPTY')
    expect(cellAt(grid, 3, 3)?.kind).toBe('LOCKED')
    expect(cellAt(grid, 3, 0)?.kind).toBe('LOCKED')
  })

  it('슬롯 행이 아예 없으면 잠금으로 본다', () => {
    // 데이터가 불완전해도 "비어 있으니 지을 수 있다"고 잘못 안내하면 안 된다.
    const grid = buildLandGrid([], [])
    expect(grid.lockedCount).toBe(16)
    expect(grid.cells.every((c) => c.kind === 'LOCKED')).toBe(true)
  })
})

describe('buildLandGrid — 특수 슬롯과 잠금 우선순위', () => {
  it('해금된 특수 슬롯은 SPECIAL 이다', () => {
    const grid = buildLandGrid(initialSlots({ '1,1': { type: 'FERTILE' } }), [])
    expect(cellAt(grid, 1, 1)?.kind).toBe('SPECIAL')
    expect(cellAt(grid, 1, 1)?.slotType).toBe('FERTILE')
  })

  it('잠긴 특수 슬롯은 LOCKED 로 그리되 타입은 유지한다', () => {
    // 특수로 그리면 유저가 이미 보너스를 받고 있다고 오해한다.
    const grid = buildLandGrid(initialSlots({ '3,3': { type: 'OIL' } }), [])
    const cell = cellAt(grid, 3, 3)
    expect(cell?.kind).toBe('LOCKED')
    expect(cell?.slotType).toBe('OIL')
    expect(cell?.locked).toBe(true)
  })
})

describe('buildLandGrid — 공장 배치', () => {
  const farm: LandFactoryRow = {
    id: 'f1',
    type: 'FARM',
    grade: 3,
    anchorX: 1,
    anchorY: 1,
    width: 1,
    height: 1,
  }

  it('1×1 공장은 앵커 한 칸만 차지한다', () => {
    const grid = buildLandGrid(initialSlots(), [farm])
    expect(cellAt(grid, 1, 1)?.kind).toBe('FACTORY')
    expect(cellAt(grid, 1, 1)?.factory?.grade).toBe(3)
    expect(grid.cells.filter((c) => c.kind === 'COVERED')).toHaveLength(0)
    expect(grid.factoryCount).toBe(1)
  })

  it('2×2 공장은 앵커 1칸 + 덮인 3칸이다', () => {
    const carFactory: LandFactoryRow = {
      id: 'f2',
      type: 'CAR_FACTORY',
      grade: 1,
      anchorX: 0,
      anchorY: 0,
      width: 2,
      height: 2,
    }
    const grid = buildLandGrid(initialSlots(), [carFactory])

    expect(cellAt(grid, 0, 0)?.kind).toBe('FACTORY')
    expect(cellAt(grid, 1, 0)?.kind).toBe('COVERED')
    expect(cellAt(grid, 0, 1)?.kind).toBe('COVERED')
    expect(cellAt(grid, 1, 1)?.kind).toBe('COVERED')
    expect(grid.cells.filter((c) => c.kind === 'COVERED')).toHaveLength(3)
  })

  it('그리드를 벗어나는 좌표가 들어와도 터지지 않는다', () => {
    const oversized: LandFactoryRow = {
      id: 'f3',
      type: 'CAR_FACTORY',
      grade: 1,
      anchorX: 3,
      anchorY: 3,
      width: 2,
      height: 2,
    }
    expect(() => buildLandGrid(initialSlots(), [oversized])).not.toThrow()
    expect(buildLandGrid(initialSlots(), [oversized]).cells).toHaveLength(16)
  })
})

describe('buildLandGrid — 보너스', () => {
  it('특수 슬롯 위의 공장은 슬롯 보너스를 받는다', () => {
    const grid = buildLandGrid(initialSlots({ '1,1': { type: 'FERTILE' } }), [
      { id: 'f1', type: 'FARM', grade: 1, anchorX: 1, anchorY: 1, width: 1, height: 1 },
    ])
    expect(cellAt(grid, 1, 1)?.factory?.slotBonus).toBeGreaterThan(1)
  })

  it('맞지 않는 특수 슬롯이면 보너스가 없다', () => {
    const grid = buildLandGrid(initialSlots({ '1,1': { type: 'ORE' } }), [
      { id: 'f1', type: 'FARM', grade: 1, anchorX: 1, anchorY: 1, width: 1, height: 1 },
    ])
    expect(cellAt(grid, 1, 1)?.factory?.slotBonus).toBe(1)
  })

  it('인접 시너지 배수가 1.0 이상 1.3 이하다', () => {
    const grid = buildLandGrid(initialSlots(), [
      { id: 'mine', type: 'MINE', grade: 1, anchorX: 0, anchorY: 0, width: 1, height: 1 },
      { id: 'mill', type: 'STEEL_MILL', grade: 1, anchorX: 1, anchorY: 0, width: 1, height: 1 },
    ])
    const mill = cellAt(grid, 1, 0)?.factory
    expect(mill?.synergyBonus).toBeGreaterThanOrEqual(1)
    expect(mill?.synergyBonus).toBeLessThanOrEqual(1.3)
  })
})

describe('findAdjacentLandIndices', () => {
  it('연속되지 않은 보유 번호에서도 올바른 이웃을 찾는다', () => {
    // 인덱스 ±1 로 계산하면 여기서 틀린다.
    expect(findAdjacentLandIndices([1, 3, 5], 3)).toEqual({ prevIndex: 1, nextIndex: 5 })
  })

  it('양 끝에서는 한쪽이 null 이다', () => {
    expect(findAdjacentLandIndices([1, 3, 5], 1)).toEqual({ prevIndex: null, nextIndex: 3 })
    expect(findAdjacentLandIndices([1, 3, 5], 5)).toEqual({ prevIndex: 3, nextIndex: null })
  })

  it('토지가 하나뿐이면 양쪽 다 null 이다', () => {
    expect(findAdjacentLandIndices([1], 1)).toEqual({ prevIndex: null, nextIndex: null })
  })

  it('보유하지 않은 번호면 양쪽 다 null 이다', () => {
    expect(findAdjacentLandIndices([1, 2], 9)).toEqual({ prevIndex: null, nextIndex: null })
  })
})
