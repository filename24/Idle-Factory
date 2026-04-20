import type { FactorySize, FactoryTier, FactoryType, MaterialType } from '../types'

export interface FactoryCatalogEntry {
  readonly type: FactoryType
  readonly tier: FactoryTier
  readonly emoji: string
  readonly size: FactorySize
  readonly output: MaterialType
  readonly baseProduction: bigint
  readonly recipe: ReadonlyArray<{
    readonly material: MaterialType
    readonly amount: bigint
  }>
  readonly secondaryOutputs: ReadonlyArray<{
    readonly material: MaterialType
    readonly amount: bigint
  }>
  readonly buildCost: bigint
  readonly upgradeMaterialBase: {
    readonly material: MaterialType
    readonly amount: bigint
  }
  readonly unlockLevel: number
  readonly mvp: boolean
}

const T1_BUILD: bigint = 1_000n
const T2_BUILD: bigint = 10_000n
const T3_BUILD: bigint = 100_000n

export const FACTORY_CATALOG: Readonly<Record<FactoryType, FactoryCatalogEntry>> = {
  FARM: {
    type: 'FARM',
    tier: 'T1',
    emoji: '🌾',
    size: { width: 1, height: 1 },
    output: 'GRAIN',
    baseProduction: 30n,
    recipe: [],
    secondaryOutputs: [],
    buildCost: T1_BUILD,
    upgradeMaterialBase: { material: 'GRAIN', amount: 10n },
    unlockLevel: 1,
    mvp: true,
  },
  MINE: {
    type: 'MINE',
    tier: 'T1',
    emoji: '⛏️',
    size: { width: 1, height: 1 },
    output: 'ORE',
    baseProduction: 15n,
    recipe: [],
    secondaryOutputs: [],
    buildCost: T1_BUILD,
    upgradeMaterialBase: { material: 'ORE', amount: 10n },
    unlockLevel: 1,
    mvp: true,
  },
  LUMBER: {
    type: 'LUMBER',
    tier: 'T1',
    emoji: '🌲',
    size: { width: 1, height: 1 },
    output: 'WOOD',
    baseProduction: 25n,
    recipe: [],
    secondaryOutputs: [],
    buildCost: T1_BUILD,
    upgradeMaterialBase: { material: 'WOOD', amount: 10n },
    unlockLevel: 1,
    mvp: true,
  },
  OIL_WELL: {
    type: 'OIL_WELL',
    tier: 'T1',
    emoji: '🛢️',
    size: { width: 1, height: 1 },
    output: 'CRUDE_OIL',
    baseProduction: 8n,
    recipe: [],
    secondaryOutputs: [],
    buildCost: T1_BUILD,
    upgradeMaterialBase: { material: 'CRUDE_OIL', amount: 10n },
    unlockLevel: 9999,
    mvp: false,
  },
  STEEL_MILL: {
    type: 'STEEL_MILL',
    tier: 'T2',
    emoji: '🏭',
    size: { width: 1, height: 1 },
    output: 'STEEL',
    baseProduction: 5n,
    recipe: [{ material: 'ORE', amount: 3n }],
    secondaryOutputs: [],
    buildCost: T2_BUILD,
    upgradeMaterialBase: { material: 'ORE', amount: 100n },
    unlockLevel: 10,
    mvp: true,
  },
  REFINERY: {
    type: 'REFINERY',
    tier: 'T2',
    emoji: '⚗️',
    size: { width: 1, height: 1 },
    output: 'FUEL',
    baseProduction: 2n,
    recipe: [{ material: 'CRUDE_OIL', amount: 2n }],
    secondaryOutputs: [{ material: 'PLASTIC', amount: 1n }],
    buildCost: T2_BUILD,
    upgradeMaterialBase: { material: 'CRUDE_OIL', amount: 100n },
    unlockLevel: 9999,
    mvp: false,
  },
  FLOUR_MILL: {
    type: 'FLOUR_MILL',
    tier: 'T2',
    emoji: '🍞',
    size: { width: 1, height: 1 },
    output: 'PROCESSED_FOOD',
    baseProduction: 8n,
    recipe: [{ material: 'GRAIN', amount: 5n }],
    secondaryOutputs: [],
    buildCost: T2_BUILD,
    upgradeMaterialBase: { material: 'GRAIN', amount: 100n },
    unlockLevel: 10,
    mvp: true,
  },
  FURNITURE_FACTORY: {
    type: 'FURNITURE_FACTORY',
    tier: 'T2',
    emoji: '🪑',
    size: { width: 1, height: 1 },
    output: 'FURNITURE',
    baseProduction: 6n,
    recipe: [{ material: 'WOOD', amount: 4n }],
    secondaryOutputs: [],
    buildCost: T2_BUILD,
    upgradeMaterialBase: { material: 'WOOD', amount: 100n },
    unlockLevel: 9999,
    mvp: false,
  },
  CAR_FACTORY: {
    type: 'CAR_FACTORY',
    tier: 'T3',
    emoji: '🚗',
    size: { width: 2, height: 2 },
    output: 'CAR',
    baseProduction: 1n,
    recipe: [
      { material: 'STEEL', amount: 3n },
      { material: 'PLASTIC', amount: 2n },
    ],
    secondaryOutputs: [],
    buildCost: T3_BUILD,
    upgradeMaterialBase: { material: 'STEEL', amount: 50n },
    unlockLevel: 25,
    mvp: true,
  },
  ELECTRONICS_FACTORY: {
    type: 'ELECTRONICS_FACTORY',
    tier: 'T3',
    emoji: '📱',
    size: { width: 2, height: 2 },
    output: 'ELECTRONIC',
    baseProduction: 1n,
    recipe: [
      { material: 'STEEL', amount: 1n },
      { material: 'PLASTIC', amount: 3n },
    ],
    secondaryOutputs: [],
    buildCost: T3_BUILD,
    upgradeMaterialBase: { material: 'STEEL', amount: 50n },
    unlockLevel: 9999,
    mvp: false,
  },
  FOOD_FACTORY: {
    type: 'FOOD_FACTORY',
    tier: 'T3',
    emoji: '🍱',
    size: { width: 2, height: 2 },
    output: 'FINISHED_FOOD',
    baseProduction: 2n,
    recipe: [
      { material: 'PROCESSED_FOOD', amount: 4n },
      { material: 'FUEL', amount: 1n },
    ],
    secondaryOutputs: [],
    buildCost: T3_BUILD,
    upgradeMaterialBase: { material: 'PROCESSED_FOOD', amount: 50n },
    unlockLevel: 9999,
    mvp: false,
  },
}

export function getFactoryEntry(type: FactoryType): FactoryCatalogEntry {
  return FACTORY_CATALOG[type]
}

export function isMvpFactory(type: FactoryType): boolean {
  return FACTORY_CATALOG[type].mvp
}
