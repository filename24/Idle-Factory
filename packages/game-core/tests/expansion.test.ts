import { describe, expect, it } from 'vitest'
import {
  isInitiallyActive,
  LAND_INITIAL_HEIGHT,
  LAND_INITIAL_WIDTH,
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  landExpansionCost,
  landExpansionLevelRequirement,
  MAX_EXPANSIONS_PER_LAND,
} from '../src/land/expansion'

describe('landExpansionCost — docs/11 §슬롯 확장 비용표', () => {
  // 1번째 구역 (N=1): 5,000 × 2^(k-1)
  it('1번 구역 k=1 ~ 7: 5k ~ 320k', () => {
    expect(landExpansionCost(1, 1)).toBe(5_000n)
    expect(landExpansionCost(1, 2)).toBe(10_000n)
    expect(landExpansionCost(1, 3)).toBe(20_000n)
    expect(landExpansionCost(1, 4)).toBe(40_000n)
    expect(landExpansionCost(1, 5)).toBe(80_000n)
    expect(landExpansionCost(1, 6)).toBe(160_000n)
    expect(landExpansionCost(1, 7)).toBe(320_000n)
  })

  // 2번째 구역 (N=2): 50,000 × 2^(k-1)
  it('2번 구역 k=1, k=7: 50k, 3.2M', () => {
    expect(landExpansionCost(2, 1)).toBe(50_000n)
    expect(landExpansionCost(2, 7)).toBe(3_200_000n)
  })

  // 5번째 구역 (N=5): 50,000,000 × 2^(k-1)
  it('5번 구역 k=1, k=7: 50M, 3.2B', () => {
    expect(landExpansionCost(5, 1)).toBe(50_000_000n)
    expect(landExpansionCost(5, 7)).toBe(3_200_000_000n)
  })

  it('범위 벗어나면 RangeError', () => {
    expect(() => landExpansionCost(0, 1)).toThrow(RangeError)
    expect(() => landExpansionCost(6, 1)).toThrow(RangeError)
    expect(() => landExpansionCost(1, 0)).toThrow(RangeError)
    expect(() => landExpansionCost(1, 8)).toThrow(RangeError)
    expect(() => landExpansionCost(1.5, 1)).toThrow(RangeError)
  })
})

describe('landExpansionLevelRequirement — docs/11 §슬롯 확장 레벨표', () => {
  it('1번 구역은 모든 k에서 0 (골드만)', () => {
    for (let k = 1; k <= 7; k++) {
      expect(landExpansionLevelRequirement(1, k)).toBe(0)
    }
  })

  it('2번 구역 대표 값 (Lv.5 / Lv.10 / Lv.20)', () => {
    expect(landExpansionLevelRequirement(2, 1)).toBe(5)
    expect(landExpansionLevelRequirement(2, 3)).toBe(10)
    expect(landExpansionLevelRequirement(2, 7)).toBe(20)
  })

  it('3번 구역 대표 값 (Lv.20 / Lv.25 / Lv.35)', () => {
    expect(landExpansionLevelRequirement(3, 1)).toBe(20)
    expect(landExpansionLevelRequirement(3, 3)).toBe(25)
    expect(landExpansionLevelRequirement(3, 7)).toBe(35)
  })

  it('5번 구역 k>=3 은 전부 Lv.50', () => {
    expect(landExpansionLevelRequirement(5, 3)).toBe(50)
    expect(landExpansionLevelRequirement(5, 7)).toBe(50)
  })

  it('범위 벗어나면 RangeError', () => {
    expect(() => landExpansionLevelRequirement(0, 1)).toThrow(RangeError)
    expect(() => landExpansionLevelRequirement(1, 8)).toThrow(RangeError)
  })
})

describe('토지 치수 상수', () => {
  it('초기 3×3, 최대 4×4, 구매 순서 1..7', () => {
    expect(LAND_INITIAL_WIDTH).toBe(3)
    expect(LAND_INITIAL_HEIGHT).toBe(3)
    expect(LAND_MAX_WIDTH).toBe(4)
    expect(LAND_MAX_HEIGHT).toBe(4)
    expect(MAX_EXPANSIONS_PER_LAND).toBe(7)
  })
})

describe('isInitiallyActive', () => {
  it('좌상단 3×3 만 true', () => {
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const expected = x < 3 && y < 3
        expect(isInitiallyActive(x, y)).toBe(expected)
      }
    }
  })
})
