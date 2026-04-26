/**
 * 도메인 공용 타입 모음.
 *
 * `game-core`는 DB에 의존하지 않으므로 Prisma enum을 순수 TS로 재선언한다.
 * 이름·값은 `packages/database/prisma/schema.prisma`와 반드시 동기화할 것.
 *
 * 참조: `docs/design/03-factories.md`, `docs/design/11-land.md`
 */

/**
 * 공장 종류. Tier(T1 원료채취 / T2 1차가공 / T3 완제품)와 1:1로 매핑된다.
 * - T1: `FARM`, `MINE`, `LUMBER`, `OIL_WELL`
 * - T2: `STEEL_MILL`, `REFINERY`, `FLOUR_MILL`, `FURNITURE_FACTORY`
 * - T3: `CAR_FACTORY`, `ELECTRONICS_FACTORY`, `FOOD_FACTORY`
 */
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

/** 공장 Tier. `docs/design/03-factories.md` §Tier 구조 참조. */
export type FactoryTier = 'T1' | 'T2' | 'T3'

/**
 * 자원/재화 종류.
 * T1 원료 → T2 가공재 → T3 완제품 + 특수 `RAW_BOOSTER`.
 */
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

/**
 * 토지 슬롯 타입. `NORMAL` 외는 특수 슬롯으로 특정 공장에 보너스를 준다.
 * 참조: `docs/design/11-land.md` §특수 슬롯.
 */
export type SlotType = 'NORMAL' | 'ORE' | 'FERTILE' | 'FOREST' | 'OIL' | 'WATER'

/** 업그레이드 부스터(영구 효과) 종류. */
export type UpgradeBooster = 'SAVING' | 'RARE' | 'SPEED' | 'PROFIT'

/**
 * 원료 부족 시 공장 동작 모드.
 * - `PAUSE`: 생산 중단
 * - `AUTO_BUY`: 시장에서 자동 구매 (Phase 2)
 * - `PARTIAL`: 가용 원료 한도 내 부분 생산 (Phase 2)
 *
 * Phase 1에서는 전부 `PAUSE`처럼 동작한다. (`production.ts` 주석 참조)
 */
export type ShortageMode = 'PAUSE' | 'AUTO_BUY' | 'PARTIAL'

/**
 * 자원 묶음. key는 `MaterialType`, value는 수량(bigint).
 * 정밀도 보장 위해 Number가 아닌 bigint로 통일.
 */
export type MaterialBag = Partial<Record<MaterialType, bigint>>

/** 공장이 차지하는 셀 크기(너비×높이). T3은 2×2, 그 외 1×1. */
export interface FactorySize {
  /** 가로 셀 수 (>=1) */
  readonly width: number
  /** 세로 셀 수 (>=1) */
  readonly height: number
}

/**
 * 공장 인스턴스의 런타임 상태. 생산 계산에 필요한 최소 필드만 포함.
 * DB 엔터티가 아니라 순수 값 객체이다.
 */
export interface FactoryState {
  /** 공장 종류 (카탈로그 키) */
  readonly type: FactoryType
  /** 공장 등급 1..10 */
  readonly grade: number
  /** 마지막으로 수확/정산이 이뤄진 시각 */
  readonly lastHarvestAt: Date
  /** 원료 부족 시 동작 모드 */
  readonly shortageMode: ShortageMode
  /** 업그레이드 시 받은 영구 부스터 (없으면 null) */
  readonly upgradeBooster: UpgradeBooster | null
  /** 원료 부스터(생산량 1.2배) 적용 중인지 여부 */
  readonly hasRawBooster: boolean
}

/** 토지 위 한 셀의 상태. */
export interface SlotState {
  /** 0-based 열 좌표 */
  readonly x: number
  /** 0-based 행 좌표 */
  readonly y: number
  /** 슬롯 타입 (`NORMAL` 또는 특수 슬롯) */
  readonly type: SlotType
  /** 이 셀을 점유 중인 공장 ID. 없으면 null. */
  readonly factoryId: string | null
  /** 아직 구매되지 않은 확장 슬롯인지 여부. true 면 배치 불가. (docs/11-land.md §슬롯 확장) */
  readonly locked: boolean
}
