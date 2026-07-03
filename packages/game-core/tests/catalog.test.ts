import { describe, expect, it } from 'vitest'
import { FACTORY_CATALOG, getFactoryEntry, isMvpFactory } from '../src/factories/catalog'

describe('FACTORY_CATALOG buildMaterialCost', () => {
  it('T1 FARM has no buildMaterialCost', () => {
    expect(FACTORY_CATALOG.FARM.buildMaterialCost).toBeUndefined()
  })

  it('STEEL_MILL (T2) build requires ORE × 100', () => {
    expect(FACTORY_CATALOG.STEEL_MILL.buildMaterialCost).toEqual({
      material: 'ORE',
      amount: 100n,
    })
  })

  it('FLOUR_MILL (T2) build requires GRAIN × 100', () => {
    expect(FACTORY_CATALOG.FLOUR_MILL.buildMaterialCost).toEqual({
      material: 'GRAIN',
      amount: 100n,
    })
  })

  it('CAR_FACTORY (T3) build requires STEEL × 50', () => {
    expect(FACTORY_CATALOG.CAR_FACTORY.buildMaterialCost).toEqual({
      material: 'STEEL',
      amount: 50n,
    })
  })
})

describe('FACTORY_CATALOG unlockLevel', () => {
  it('STEEL_MILL unlocks at level 5', () => {
    expect(FACTORY_CATALOG.STEEL_MILL.unlockLevel).toBe(5)
  })

  it('FLOUR_MILL unlocks at level 5', () => {
    expect(FACTORY_CATALOG.FLOUR_MILL.unlockLevel).toBe(5)
  })

  it('CAR_FACTORY unlocks at level 10', () => {
    expect(FACTORY_CATALOG.CAR_FACTORY.unlockLevel).toBe(10)
  })

  // Phase 2 로스터 완성: 잠긴 5종 해금 (09-level-xp.md 균일안, 2026-07-03 확정)
  it('OIL_WELL (T1) unlocks at level 1', () => {
    expect(FACTORY_CATALOG.OIL_WELL.unlockLevel).toBe(1)
  })

  it('REFINERY (T2) unlocks at level 5', () => {
    expect(FACTORY_CATALOG.REFINERY.unlockLevel).toBe(5)
  })

  it('FURNITURE_FACTORY (T2) unlocks at level 5', () => {
    expect(FACTORY_CATALOG.FURNITURE_FACTORY.unlockLevel).toBe(5)
  })

  it('ELECTRONICS_FACTORY (T3) unlocks at level 10', () => {
    expect(FACTORY_CATALOG.ELECTRONICS_FACTORY.unlockLevel).toBe(10)
  })

  it('FOOD_FACTORY (T3) unlocks at level 10', () => {
    expect(FACTORY_CATALOG.FOOD_FACTORY.unlockLevel).toBe(10)
  })

  it('completes the 11-factory roster with no 9999 sentinel remaining', () => {
    const entries = Object.values(FACTORY_CATALOG)
    expect(entries).toHaveLength(11)
    expect(entries.filter((e) => e.unlockLevel >= 9999)).toEqual([])
  })

  it('aligns every factory unlock level with its tier (T1:1 / T2:5 / T3:10)', () => {
    const tierUnlock = { T1: 1, T2: 5, T3: 10 } as const
    for (const entry of Object.values(FACTORY_CATALOG)) {
      expect(entry.unlockLevel).toBe(tierUnlock[entry.tier])
    }
  })
})

describe('REFINERY → PLASTIC → CAR_FACTORY unlock chain', () => {
  it('makes REFINERY the sole PLASTIC source, unlocked at Lv.5', () => {
    expect(FACTORY_CATALOG.REFINERY.unlockLevel).toBe(5)
    const plasticSources = Object.values(FACTORY_CATALOG).filter((entry) =>
      entry.secondaryOutputs.some((output) => output.material === 'PLASTIC'),
    )
    expect(plasticSources.map((entry) => entry.type)).toEqual(['REFINERY'])
  })

  it('unlocks CAR_FACTORY (needs PLASTIC) no earlier than its PLASTIC supplier', () => {
    const car = FACTORY_CATALOG.CAR_FACTORY
    expect(car.recipe.some((input) => input.material === 'PLASTIC')).toBe(true)
    // CAR_FACTORY(Lv.10)는 PLASTIC 공급원 REFINERY(Lv.5) 해금 이후에 열려 병목이 해소된다.
    expect(car.unlockLevel).toBeGreaterThanOrEqual(FACTORY_CATALOG.REFINERY.unlockLevel)
  })
})

describe('isMvpFactory', () => {
  it('flags FARM/MINE/LUMBER/STEEL_MILL/FLOUR_MILL/CAR_FACTORY as MVP', () => {
    expect(isMvpFactory('FARM')).toBe(true)
    expect(isMvpFactory('MINE')).toBe(true)
    expect(isMvpFactory('LUMBER')).toBe(true)
    expect(isMvpFactory('STEEL_MILL')).toBe(true)
    expect(isMvpFactory('FLOUR_MILL')).toBe(true)
    expect(isMvpFactory('CAR_FACTORY')).toBe(true)
  })

  it('excludes non-MVP factories', () => {
    expect(isMvpFactory('OIL_WELL')).toBe(false)
    expect(isMvpFactory('REFINERY')).toBe(false)
    expect(isMvpFactory('FURNITURE_FACTORY')).toBe(false)
    expect(isMvpFactory('ELECTRONICS_FACTORY')).toBe(false)
    expect(isMvpFactory('FOOD_FACTORY')).toBe(false)
  })
})

describe('getFactoryEntry', () => {
  it('returns the catalog entry for a type', () => {
    expect(getFactoryEntry('FARM').type).toBe('FARM')
  })
})
