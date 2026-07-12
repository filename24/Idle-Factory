import { describe, expect, it } from 'vitest'
import {
  BOOSTER_CHOICE_GRADES,
  boosterConsumptionMultiplier,
  boosterProductionMultiplier,
  computeRareBoosterDrop,
  isBoosterChoiceGrade,
  RARE_BOOSTER_DROP_RATE,
  RAW_BOOSTER_UNLOCK_LEVEL,
} from '../src/factories/booster'

describe('BOOSTER_CHOICE_GRADES / isBoosterChoiceGrade', () => {
  it('defines exactly grades 3, 5, 7, 10', () => {
    expect([...BOOSTER_CHOICE_GRADES]).toEqual([3, 5, 7, 10])
  })

  it('returns true only for choice grades', () => {
    for (const grade of [3, 5, 7, 10]) {
      expect(isBoosterChoiceGrade(grade)).toBe(true)
    }
    for (const grade of [1, 2, 4, 6, 8, 9, 11, 0, -1]) {
      expect(isBoosterChoiceGrade(grade)).toBe(false)
    }
  })
})

describe('boosterProductionMultiplier', () => {
  it('returns 115/100 for SPEED', () => {
    const m = boosterProductionMultiplier('SPEED')
    expect(m.numerator).toBe(115n)
    expect(m.denominator).toBe(100n)
  })

  it('returns 11/10 for PROFIT', () => {
    const m = boosterProductionMultiplier('PROFIT')
    expect(m.numerator).toBe(11n)
    expect(m.denominator).toBe(10n)
  })

  it('returns identity for SAVING, RARE and null', () => {
    for (const booster of ['SAVING', 'RARE', null] as const) {
      const m = boosterProductionMultiplier(booster)
      expect(m.numerator).toBe(1n)
      expect(m.denominator).toBe(1n)
    }
  })
})

describe('boosterConsumptionMultiplier', () => {
  it('returns 8/10 for SAVING', () => {
    const m = boosterConsumptionMultiplier('SAVING')
    expect(m.numerator).toBe(8n)
    expect(m.denominator).toBe(10n)
  })

  it('returns identity for SPEED, PROFIT, RARE and null', () => {
    for (const booster of ['SPEED', 'PROFIT', 'RARE', null] as const) {
      const m = boosterConsumptionMultiplier(booster)
      expect(m.numerator).toBe(1n)
      expect(m.denominator).toBe(1n)
    }
  })
})

describe('RARE_BOOSTER_DROP_RATE / RAW_BOOSTER_UNLOCK_LEVEL', () => {
  it('matches design values (T1 0.5%, T2 1%, T3 excluded)', () => {
    expect(RARE_BOOSTER_DROP_RATE.T1).toBe(0.005)
    expect(RARE_BOOSTER_DROP_RATE.T2).toBe(0.01)
    expect(RARE_BOOSTER_DROP_RATE.T3).toBe(0)
  })

  it('unlock level is 50', () => {
    expect(RAW_BOOSTER_UNLOCK_LEVEL).toBe(50)
  })
})

describe('computeRareBoosterDrop', () => {
  it('drops every tick when rng is always below the T1 rate', () => {
    const drops = computeRareBoosterDrop({
      type: 'FARM',
      upgradeBooster: 'RARE',
      ticks: 10,
      rng: () => 0.004,
    })
    expect(drops).toBe(10n)
  })

  it('respects the tier rate boundary (0.006 fails T1, passes T2)', () => {
    const t1 = computeRareBoosterDrop({
      type: 'FARM',
      upgradeBooster: 'RARE',
      ticks: 10,
      rng: () => 0.006,
    })
    const t2 = computeRareBoosterDrop({
      type: 'STEEL_MILL',
      upgradeBooster: 'RARE',
      ticks: 10,
      rng: () => 0.006,
    })
    expect(t1).toBe(0n)
    expect(t2).toBe(10n)
  })

  it('counts only successful ticks in a mixed rng sequence', () => {
    const sequence = [0.001, 0.9, 0.5, 0.009, 0.99]
    let i = 0
    const drops = computeRareBoosterDrop({
      type: 'STEEL_MILL',
      upgradeBooster: 'RARE',
      ticks: sequence.length,
      rng: () => sequence[i++]!,
    })
    expect(drops).toBe(2n)
  })

  it('returns 0 for non-RARE boosters', () => {
    for (const booster of ['SAVING', 'SPEED', 'PROFIT', null] as const) {
      const drops = computeRareBoosterDrop({
        type: 'FARM',
        upgradeBooster: booster,
        ticks: 100,
        rng: () => 0,
      })
      expect(drops).toBe(0n)
    }
  })

  it('returns 0 for T3 factories even with RARE', () => {
    const drops = computeRareBoosterDrop({
      type: 'CAR_FACTORY',
      upgradeBooster: 'RARE',
      ticks: 100,
      rng: () => 0,
    })
    expect(drops).toBe(0n)
  })

  it('returns 0 for zero or negative ticks', () => {
    expect(
      computeRareBoosterDrop({
        type: 'FARM',
        upgradeBooster: 'RARE',
        ticks: 0,
        rng: () => 0,
      }),
    ).toBe(0n)
    expect(
      computeRareBoosterDrop({
        type: 'FARM',
        upgradeBooster: 'RARE',
        ticks: -5,
        rng: () => 0,
      }),
    ).toBe(0n)
  })
})
