import { describe, expect, it } from 'vitest'
import {
  buildCost,
  cumulativeUpgradeCost,
  destroyRefund,
  moveCost,
  upgradeCost,
  upgradeMaterialCost,
} from '../src/factories/cost'

describe('buildCost', () => {
  it('returns 1000 for FARM (T1)', () => {
    expect(buildCost('FARM')).toBe(1000n)
  })

  it('returns 10000 for STEEL_MILL (T2)', () => {
    expect(buildCost('STEEL_MILL')).toBe(10_000n)
  })

  it('returns 100000 for CAR_FACTORY (T3)', () => {
    expect(buildCost('CAR_FACTORY')).toBe(100_000n)
  })
})

describe('upgradeCost', () => {
  it('FARM 1→2 = 3000', () => {
    expect(upgradeCost('FARM', 1)).toBe(3000n)
  })

  it('FARM 2→3 = 9000', () => {
    expect(upgradeCost('FARM', 2)).toBe(9000n)
  })

  it('FARM 3→4 = 27000', () => {
    expect(upgradeCost('FARM', 3)).toBe(27_000n)
  })

  it('FARM 9→10 = 19_683_000', () => {
    expect(upgradeCost('FARM', 9)).toBe(19_683_000n)
  })

  it('STEEL_MILL 1→2 = 30000', () => {
    expect(upgradeCost('STEEL_MILL', 1)).toBe(30_000n)
  })

  it('CAR_FACTORY 1→2 = 300000', () => {
    expect(upgradeCost('CAR_FACTORY', 1)).toBe(300_000n)
  })

  it('throws RangeError for fromGrade = 0', () => {
    expect(() => upgradeCost('FARM', 0)).toThrow(RangeError)
  })

  it('throws RangeError for fromGrade = 10', () => {
    expect(() => upgradeCost('FARM', 10)).toThrow(RangeError)
  })
})

describe('cumulativeUpgradeCost', () => {
  it('FARM 1→10 = 29_523_000 (sum of 3^1..3^9 × 1000)', () => {
    // sum_{k=1..9} 3^k = (3^10 - 3) / 2 = 29_523
    expect(cumulativeUpgradeCost('FARM', 1, 10)).toBe(29_523_000n)
  })

  it('FARM 1→2 equals single upgrade 1→2', () => {
    expect(cumulativeUpgradeCost('FARM', 1, 2)).toBe(upgradeCost('FARM', 1))
  })

  it('throws RangeError when toGrade > 10', () => {
    expect(() => cumulativeUpgradeCost('FARM', 1, 11)).toThrow(RangeError)
  })

  it('throws RangeError when fromGrade < 1', () => {
    expect(() => cumulativeUpgradeCost('FARM', 0, 5)).toThrow(RangeError)
  })

  it('throws RangeError when fromGrade >= toGrade', () => {
    expect(() => cumulativeUpgradeCost('FARM', 5, 5)).toThrow(RangeError)
  })
})

describe('upgradeMaterialCost', () => {
  it('FARM 1→2 material = GRAIN × 20', () => {
    expect(upgradeMaterialCost('FARM', 1)).toEqual({
      material: 'GRAIN',
      amount: 20n,
    })
  })

  it('FARM 2→3 material = GRAIN × 40', () => {
    expect(upgradeMaterialCost('FARM', 2)).toEqual({
      material: 'GRAIN',
      amount: 40n,
    })
  })

  it('FARM 3→4 material = GRAIN × 80', () => {
    expect(upgradeMaterialCost('FARM', 3)).toEqual({
      material: 'GRAIN',
      amount: 80n,
    })
  })

  it('throws RangeError for fromGrade = 0', () => {
    expect(() => upgradeMaterialCost('FARM', 0)).toThrow(RangeError)
  })

  it('throws RangeError for fromGrade = 10', () => {
    expect(() => upgradeMaterialCost('FARM', 10)).toThrow(RangeError)
  })
})

describe('moveCost', () => {
  it('FARM move cost = 250 (25% of 1000)', () => {
    expect(moveCost('FARM')).toBe(250n)
  })
})

describe('destroyRefund', () => {
  it('FARM destroy refund = 500 (50% of 1000)', () => {
    expect(destroyRefund('FARM')).toBe(500n)
  })
})
