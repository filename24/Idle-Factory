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
