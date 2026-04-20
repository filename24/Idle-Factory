// Pure TS re-declaration of Prisma enums (game-core has no DB dependency).
// Keep names and values in sync with packages/database/prisma/schema.prisma.

export type FactoryType =
  | 'FARM'
  | 'MINE'
  | 'LUMBER'
  | 'OIL_WELL'
  | 'STEEL_MILL'
  | 'REFINERY'
  | 'FLOUR_MILL'
  | 'FURNITURE_FACTORY'
  | 'CAR_FACTORY'
  | 'ELECTRONICS_FACTORY'
  | 'FOOD_FACTORY'

export type FactoryTier = 'T1' | 'T2' | 'T3'

export type MaterialType =
  | 'GRAIN'
  | 'ORE'
  | 'WOOD'
  | 'CRUDE_OIL'
  | 'STEEL'
  | 'FUEL'
  | 'PLASTIC'
  | 'PROCESSED_FOOD'
  | 'FURNITURE'
  | 'CAR'
  | 'ELECTRONIC'
  | 'FINISHED_FOOD'
  | 'RAW_BOOSTER'

export type SlotType = 'NORMAL' | 'ORE' | 'FERTILE' | 'FOREST' | 'OIL' | 'WATER'

export type UpgradeBooster = 'SAVING' | 'RARE' | 'SPEED' | 'PROFIT'

export type ShortageMode = 'PAUSE' | 'AUTO_BUY' | 'PARTIAL'

export type MaterialBag = Partial<Record<MaterialType, bigint>>

export interface FactorySize {
  readonly width: number
  readonly height: number
}

export interface FactoryState {
  readonly type: FactoryType
  readonly grade: number
  readonly lastHarvestAt: Date
  readonly shortageMode: ShortageMode
  readonly upgradeBooster: UpgradeBooster | null
  readonly hasRawBooster: boolean
}

export interface SlotState {
  readonly x: number
  readonly y: number
  readonly type: SlotType
  readonly locked: boolean
  readonly factoryId: string | null
}
