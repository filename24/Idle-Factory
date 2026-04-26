import { describe, expect, it } from 'vitest'
import {
  capacityOf,
  computeFree,
  computeUsed,
  isFull,
  upgradeCostOf,
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

describe('computeUsed', () => {
  it('sums material stack sizes', () => {
    expect(computeUsed({ GRAIN: 100n, ORE: 50n })).toBe(150n)
  })

  it('returns 0n for empty bag', () => {
    expect(computeUsed({})).toBe(0n)
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
