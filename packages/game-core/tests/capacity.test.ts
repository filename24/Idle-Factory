import { describe, expect, it } from 'vitest'
import {
  capacityOf,
  computeFree,
  computeUsed,
  isFull,
  MATERIAL_VOLUME,
  unitsThatFit,
  upgradeCostOf,
  volumeOf,
} from '../src/warehouse/capacity'

describe('capacityOf', () => {
  it('returns capacity for grade 1', () => {
    expect(capacityOf(1)).toBe(3_000n)
  })

  it('returns capacity for grade 2 (×3 scaling)', () => {
    expect(capacityOf(2)).toBe(9_000n)
  })

  it('returns capacity for grade 10', () => {
    expect(capacityOf(10)).toBe(59_049_000n)
  })

  it('throws for grade 0', () => {
    expect(() => capacityOf(0)).toThrow(RangeError)
  })

  it('throws for grade 11', () => {
    expect(() => capacityOf(11)).toThrow(RangeError)
  })
})

describe('upgradeCostOf', () => {
  it('returns grade 2 cost', () => {
    expect(upgradeCostOf(2)).toEqual({
      money: 5_000n,
      material: 'WOOD',
      amount: 100n,
    })
  })

  it('returns grade 5 cost', () => {
    expect(upgradeCostOf(5)).toEqual({
      money: 150_000n,
      material: 'STEEL',
      amount: 200n,
    })
  })

  it('returns grade 8 cost', () => {
    expect(upgradeCostOf(8)).toEqual({
      money: 5_000_000n,
      material: 'CAR',
      amount: 10n,
    })
  })

  it('throws for grade 1 (no upgrade to starting grade)', () => {
    expect(() => upgradeCostOf(1)).toThrow(RangeError)
  })
})

describe('volumeOf / MATERIAL_VOLUME', () => {
  it('T1 원자재는 산출 개수를 보정하는 계수를 갖는다 (#21 결정 4)', () => {
    expect(volumeOf('GRAIN')).toBe(1n)
    expect(volumeOf('WOOD')).toBe(1n)
    expect(volumeOf('ORE')).toBe(2n)
    expect(volumeOf('CRUDE_OIL')).toBe(5n)
  })

  it('T2·T3 는 계수 1 — 창고 효율 우위를 남긴다 (#21 결정 3)', () => {
    for (const material of [
      'STEEL',
      'FUEL',
      'PLASTIC',
      'PROCESSED_FOOD',
      'FURNITURE',
      'CAR',
      'ELECTRONIC',
      'FINISHED_FOOD',
      'RAW_BOOSTER',
    ] as const) {
      expect(volumeOf(material), material).toBe(1n)
    }
  })

  it('모든 계수가 1 이상이다 — 0 이면 무한 적재가 된다', () => {
    for (const [material, volume] of Object.entries(MATERIAL_VOLUME)) {
      expect(volume, material).toBeGreaterThanOrEqual(1n)
    }
  })
})

describe('computeUsed', () => {
  it('개수가 아니라 부피(개수 × 계수)를 합산한다', () => {
    // GRAIN 100×1 + ORE 50×2 = 200
    expect(computeUsed({ GRAIN: 100n, ORE: 50n })).toBe(200n)
  })

  it('원유는 1 개가 5 슬롯을 차지한다', () => {
    expect(computeUsed({ CRUDE_OIL: 10n })).toBe(50n)
  })

  it('returns 0n for empty bag', () => {
    expect(computeUsed({})).toBe(0n)
  })
})

describe('unitsThatFit', () => {
  it('여유 용량을 담을 수 있는 개수로 환산한다', () => {
    expect(unitsThatFit('GRAIN', 100n)).toBe(100n)
    expect(unitsThatFit('ORE', 100n)).toBe(50n)
    expect(unitsThatFit('CRUDE_OIL', 100n)).toBe(20n)
  })

  it('내림 처리한다 — 부분 적재는 없다', () => {
    expect(unitsThatFit('CRUDE_OIL', 9n)).toBe(1n)
  })

  it('여유가 없거나 음수면 0n', () => {
    expect(unitsThatFit('GRAIN', 0n)).toBe(0n)
    expect(unitsThatFit('GRAIN', -5n)).toBe(0n)
  })
})

describe('computeFree', () => {
  it('returns remaining capacity', () => {
    expect(computeFree(1, { GRAIN: 300n })).toBe(2_700n)
  })

  it('clamps to 0n when over capacity', () => {
    expect(computeFree(1, { GRAIN: 5_000n })).toBe(0n)
  })
})

describe('isFull', () => {
  it('is true when used equals capacity', () => {
    expect(isFull(1, { GRAIN: 3_000n })).toBe(true)
  })

  it('is false when below capacity', () => {
    expect(isFull(1, { GRAIN: 2_999n })).toBe(false)
  })
})
