import type { FactorySize, FactoryTier, FactoryType, MaterialType } from '../types'

/**
 * 공장 카탈로그 한 항목의 불변 정의.
 *
 * 각 필드의 수치 출처: `docs/design/03-factories.md` §공장별 상세.
 * 런타임 계산에서 이 객체를 수정해서는 안 된다 (모든 필드 readonly).
 */
export interface FactoryCatalogEntry {
  /** 공장 종류 키 */
  readonly type: FactoryType
  /** Tier (T1/T2/T3). 건설비와 업그레이드 규모의 기준이 된다. */
  readonly tier: FactoryTier
  /** 토지 UI/채팅 렌더에 쓰이는 이모지 */
  readonly emoji: string
  /** 점유 셀 크기. T3은 2×2, 그 외 1×1. */
  readonly size: FactorySize
  /** 1차(주) 산출 자원 종류 */
  readonly output: MaterialType
  /** 1 tick 당 기본 생산량 (등급·보너스 적용 전) */
  readonly baseProduction: bigint
  /** 1 tick 당 필요한 원료 목록. T1은 빈 배열. */
  readonly recipe: ReadonlyArray<{
    readonly material: MaterialType
    readonly amount: bigint
  }>
  /** 부산물 목록. 현재 `REFINERY`만 `PLASTIC`을 추가 산출. */
  readonly secondaryOutputs: ReadonlyArray<{
    readonly material: MaterialType
    readonly amount: bigint
  }>
  /** 등급 1 건설 비용 (화폐, bigint) */
  readonly buildCost: bigint
  /**
   * 업그레이드 시 요구되는 원료의 기준값.
   * 실제 등급 N→N+1 비용은 `amount × 2^(N-1)` (`upgradeMaterialCost` 참조).
   * Tier 기준값 — T1: 20, T2: 10, T3: 5.
   */
  readonly upgradeMaterialBase: {
    readonly material: MaterialType
    readonly amount: bigint
  }
  /**
   * 신규 건설 시 화폐 비용과 함께 추가로 소모되는 원료 (T2/T3에만 존재).
   * 근거: `docs/design/03-factories.md` §건설 비용 — T2는 원료 ×100, T3은 원료 ×50.
   */
  readonly buildMaterialCost?: {
    readonly material: MaterialType
    readonly amount: bigint
  }
  /** 이 공장을 해금하는 플레이어 레벨. `9999`면 Phase 1 MVP 미포함. */
  readonly unlockLevel: number
  /** Phase 1 MVP 출시에 포함되는지 여부 */
  readonly mvp: boolean
}

/** T1 공장 건설 비용 (Tier 고정값). `docs/design/03-factories.md` §비용표. */
const T1_BUILD: bigint = 1_000n
/** T2 공장 건설 비용. */
const T2_BUILD: bigint = 10_000n
/** T3 공장 건설 비용. */
const T3_BUILD: bigint = 100_000n

/**
 * 공장 종류 → 카탈로그 항목 매핑.
 *
 * 수치는 `docs/design/03-factories.md` §공장별 상세를 근거로 한다.
 * 런타임에서 수정 금지. 설계 변경 시 본 파일을 업데이트하고 테스트를 갱신할 것.
 */
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
    upgradeMaterialBase: { material: 'GRAIN', amount: 20n },
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
    upgradeMaterialBase: { material: 'ORE', amount: 20n },
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
    upgradeMaterialBase: { material: 'WOOD', amount: 20n },
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
    upgradeMaterialBase: { material: 'CRUDE_OIL', amount: 20n },
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
    upgradeMaterialBase: { material: 'ORE', amount: 10n },
    buildMaterialCost: { material: 'ORE', amount: 100n },
    unlockLevel: 5,
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
    upgradeMaterialBase: { material: 'CRUDE_OIL', amount: 10n },
    buildMaterialCost: { material: 'CRUDE_OIL', amount: 100n },
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
    upgradeMaterialBase: { material: 'GRAIN', amount: 10n },
    buildMaterialCost: { material: 'GRAIN', amount: 100n },
    unlockLevel: 5,
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
    upgradeMaterialBase: { material: 'WOOD', amount: 10n },
    buildMaterialCost: { material: 'WOOD', amount: 100n },
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
    upgradeMaterialBase: { material: 'STEEL', amount: 5n },
    buildMaterialCost: { material: 'STEEL', amount: 50n },
    unlockLevel: 10,
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
    upgradeMaterialBase: { material: 'STEEL', amount: 5n },
    buildMaterialCost: { material: 'PLASTIC', amount: 50n },
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
    upgradeMaterialBase: { material: 'PROCESSED_FOOD', amount: 5n },
    buildMaterialCost: { material: 'PROCESSED_FOOD', amount: 50n },
    unlockLevel: 9999,
    mvp: false,
  },
}

/**
 * 공장 종류에 대응되는 카탈로그 항목을 반환한다.
 *
 * @param type 공장 종류
 * @returns 불변 카탈로그 엔트리
 */
export function getFactoryEntry(type: FactoryType): FactoryCatalogEntry {
  return FACTORY_CATALOG[type]
}

/**
 * Phase 1 MVP 출시에 포함되는 공장인지 판별한다.
 *
 * @param type 공장 종류
 * @returns MVP 공장이면 true
 */
export function isMvpFactory(type: FactoryType): boolean {
  return FACTORY_CATALOG[type].mvp
}
