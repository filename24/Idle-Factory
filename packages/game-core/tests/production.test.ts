import { describe, expect, it } from 'vitest'
import {
  computeElapsedTicks,
  computeFactoryYield,
  computeGradeMultiplier,
  MAX_TICKS_PER_HARVEST,
  TICK_MS,
} from '../src/factories/production'
import type { FactoryState, MaterialBag } from '../src/types'

function makeFactory(overrides: Partial<FactoryState> = {}): FactoryState {
  return {
    type: 'FARM',
    grade: 1,
    lastHarvestAt: new Date(0),
    shortageMode: 'PAUSE',
    upgradeBooster: null,
    hasRawBooster: false,
    ...overrides,
  }
}

const HUGE_WAREHOUSE = 10n ** 18n

describe('computeElapsedTicks', () => {
  it('returns 1 for exactly 10 minutes elapsed', () => {
    expect(computeElapsedTicks(new Date(0), new Date(TICK_MS))).toBe(1)
  })

  it('returns 0 for 1 minute elapsed', () => {
    expect(computeElapsedTicks(new Date(0), new Date(60 * 1000))).toBe(0)
  })

  it('returns 2 for 25 minutes elapsed', () => {
    expect(computeElapsedTicks(new Date(0), new Date(25 * 60 * 1000))).toBe(2)
  })

  it('returns 0 for negative diff (clock skew)', () => {
    expect(computeElapsedTicks(new Date(TICK_MS), new Date(0))).toBe(0)
  })

  it('clamps to MAX_TICKS_PER_HARVEST for very long elapsed time', () => {
    expect(computeElapsedTicks(new Date(0), new Date(100_000 * 60 * 1000))).toBe(
      MAX_TICKS_PER_HARVEST,
    )
  })
})

describe('computeGradeMultiplier', () => {
  it('returns 1/1 at grade 1 without booster', () => {
    const m = computeGradeMultiplier(1, false)
    expect(m.numerator).toBe(1n)
    expect(m.denominator).toBe(1n)
  })

  it('returns 3/2 at grade 2', () => {
    const m = computeGradeMultiplier(2, false)
    expect(m.numerator).toBe(3n)
    expect(m.denominator).toBe(2n)
  })

  it('returns 9/4 at grade 3', () => {
    const m = computeGradeMultiplier(3, false)
    expect(m.numerator).toBe(9n)
    expect(m.denominator).toBe(4n)
  })

  it('applies raw booster as 12/10', () => {
    const m = computeGradeMultiplier(1, true)
    expect(m.numerator).toBe(12n)
    expect(m.denominator).toBe(10n)
  })
})

describe('computeFactoryYield — T1 farm', () => {
  it('grade 1 × 1 tick produces 30 grain with no consumption', () => {
    const result = computeFactoryYield({
      factory: makeFactory(),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.ticksRealized).toBe(1)
    expect(result.produced.GRAIN).toBe(30n)
    expect(result.consumed).toEqual({})
  })

  it('grade 2 × 1 tick produces 45 grain', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ grade: 2 }),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.produced.GRAIN).toBe(45n)
  })

  it('grade 3 × 1 tick produces 67 grain (floor of 270/4)', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ grade: 3 }),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.produced.GRAIN).toBe(67n)
  })

  it('slotBonus 1.2 at grade 1 × 1 tick yields 36 grain', () => {
    const result = computeFactoryYield({
      factory: makeFactory(),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
      slotBonus: 1.2,
    })
    expect(result.produced.GRAIN).toBe(36n)
  })

  it('raw booster at grade 1 × 1 tick yields 36 grain', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ hasRawBooster: true }),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.produced.GRAIN).toBe(36n)
  })
})

describe('computeFactoryYield — warehouse clamp', () => {
  it('clamps ticks when warehouse free space runs out', () => {
    const result = computeFactoryYield({
      factory: makeFactory(),
      availableMaterials: {},
      warehouseFree: 100n,
      elapsedTicks: 10,
    })
    expect(result.ticksRealized).toBe(3)
    expect(result.produced.GRAIN).toBe(90n)
  })
})

describe('computeFactoryYield — T2 steel mill', () => {
  it('consumes 3 ore and produces 5 steel per tick', () => {
    const materials: MaterialBag = { ORE: 100n }
    const result = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL' }),
      availableMaterials: materials,
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.ticksRealized).toBe(1)
    expect(result.consumed.ORE).toBe(3n)
    expect(result.produced.STEEL).toBe(5n)
  })

  it('PAUSE mode limits ticks to available ore (6 ore → 2 ticks)', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL', shortageMode: 'PAUSE' }),
      availableMaterials: { ORE: 6n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(result.ticksRealized).toBe(2)
    expect(result.consumed.ORE).toBe(6n)
    expect(result.produced.STEEL).toBe(10n)
  })
})

describe('computeFactoryYield — refinery secondary output', () => {
  it('produces FUEL and PLASTIC while consuming CRUDE_OIL', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ type: 'REFINERY' }),
      availableMaterials: { CRUDE_OIL: 2n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 1,
    })
    expect(result.ticksRealized).toBe(1)
    expect(result.consumed.CRUDE_OIL).toBe(2n)
    expect(result.produced.FUEL).toBe(2n)
    expect(result.produced.PLASTIC).toBe(1n)
  })
})

describe('computeGradeMultiplier — upgradeBooster', () => {
  it('applies SPEED as ×115/100', () => {
    const m = computeGradeMultiplier(1, false, 'SPEED')
    expect(m.numerator).toBe(115n)
    expect(m.denominator).toBe(100n)
  })

  it('applies PROFIT as ×11/10', () => {
    const m = computeGradeMultiplier(1, false, 'PROFIT')
    expect(m.numerator).toBe(11n)
    expect(m.denominator).toBe(10n)
  })

  it('SAVING/RARE/null leave the production multiplier unchanged', () => {
    for (const booster of ['SAVING', 'RARE', null] as const) {
      const m = computeGradeMultiplier(1, false, booster)
      expect(m.numerator).toBe(1n)
      expect(m.denominator).toBe(1n)
    }
  })

  it('stacks with grade and raw booster (grade 2 + raw + SPEED)', () => {
    const m = computeGradeMultiplier(2, true, 'SPEED')
    expect(m.numerator).toBe(3n * 12n * 115n)
    expect(m.denominator).toBe(2n * 10n * 100n)
  })
})

describe('computeFactoryYield — upgradeBooster effects', () => {
  it('SPEED boosts FARM output by ×1.15 (10 ticks: 300 → 345)', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ upgradeBooster: 'SPEED' }),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(result.ticksRealized).toBe(10)
    expect(result.produced.GRAIN).toBe(345n)
  })

  it('PROFIT boosts FARM output by ×1.1 (10 ticks: 300 → 330)', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ upgradeBooster: 'PROFIT' }),
      availableMaterials: {},
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(result.produced.GRAIN).toBe(330n)
  })

  it('SAVING reduces STEEL_MILL consumption ×0.8 without touching output', () => {
    const result = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL', upgradeBooster: 'SAVING' }),
      availableMaterials: { ORE: 100n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(result.ticksRealized).toBe(10)
    // 3 ORE/tick × 10 ticks × 0.8 = 24
    expect(result.consumed.ORE).toBe(24n)
    expect(result.produced.STEEL).toBe(50n)
  })

  it('SAVING extends the material clamp (12 ORE: 4 ticks → 5 ticks)', () => {
    const noBooster = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL' }),
      availableMaterials: { ORE: 12n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(noBooster.ticksRealized).toBe(4)

    const withSaving = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL', upgradeBooster: 'SAVING' }),
      availableMaterials: { ORE: 12n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    // floor(12×10 / (3×8)) = 5 ticks, consumed = ⌊3×5×8/10⌋ = 12 ≤ 12
    expect(withSaving.ticksRealized).toBe(5)
    expect(withSaving.consumed.ORE).toBe(12n)
    expect(withSaving.produced.STEEL).toBe(25n)
  })

  it('RARE leaves produced/consumed identical to no booster', () => {
    const base = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL' }),
      availableMaterials: { ORE: 30n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    const rare = computeFactoryYield({
      factory: makeFactory({ type: 'STEEL_MILL', upgradeBooster: 'RARE' }),
      availableMaterials: { ORE: 30n },
      warehouseFree: HUGE_WAREHOUSE,
      elapsedTicks: 10,
    })
    expect(rare).toEqual(base)
  })
})
