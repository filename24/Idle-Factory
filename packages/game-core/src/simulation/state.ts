/**
 * 시뮬레이션 내부 상태 — 생성·전이·스냅샷.
 *
 * tick 루프는 4천~수십만 회 반복되므로 매 tick 전체 상태를 복제하면 비용이
 * 지배적이 된다. 따라서 **루프 내부에서만** 가변 구조(`MutableUser`)를 쓰고,
 * 외부로 나가는 결과는 전부 `readonly` 스냅샷으로 변환한다. game-core 의
 * 불변성 규약(입력을 변형하지 않는다)은 지켜진다 — 시뮬레이터는 `SimScenario`
 * 를 읽기만 하고 자체 상태를 새로 만든다.
 */

import { MARKET_BASE_PRICES } from '../market/basePrices'
import type { FactoryType, MaterialBag, MaterialType } from '../types'
import { getPlayProfile } from './profiles'
import type {
  EconomyParams,
  PlayProfile,
  PlayProfileKind,
  SimFactory,
  SimMarketEntry,
  SimScenario,
  SimUser,
} from './types'

/**
 * 유저 시작 자금 — 1,000원.
 * 근거: docs/design/00-onboarding.md §초기 지급 "초기 자금 1,000원 — 첫 T1 공장
 * 1개 건설 가능".
 */
export const STARTING_MONEY = 1_000n

/**
 * 경제 파라미터 기본값 — 전부 game-core 상수(설계 확정값)와 동일하다.
 *
 * 스윕(#31 §파라미터 스윕)은 이 기준선에서 축을 하나씩 흔들어 인플레율
 * 민감도를 본다. 기본값 자체를 바꾸는 것은 설계 변경이므로 문서 개정이
 * 선행되어야 한다.
 */
export const DEFAULT_ECONOMY_PARAMS: EconomyParams = {
  // PRICE_NOISE_LIMIT (docs/design/06-market.md §가격 변동 ±20%)
  noiseLimit: 0.2,
  // DEFAULT_DEMAND_COEFFICIENT (같은 문서 §가격 산출 공식 "k: 예: 0.1")
  demandCoefficient: 0.1,
  // Guild.taxSurcharge 기본 0 — 시드는 0.1 이지만 기준선은 가산세 없는 서버로 둔다.
  taxSurcharge: 0,
  // DIRECT_BUY_PRICE_MULTIPLIER (docs/design/04-economy.md §가격 결정 ×2)
  directBuyMultiplier: 2,
}

/** 내부 가변 공장 상태. */
export interface MutableFactory {
  /** 공장 식별자. */
  id: string
  /** 공장 종류. */
  type: FactoryType
  /** 현재 등급. */
  grade: number
  /** 마지막 수확 tick. */
  lastHarvestTick: number
}

/** 내부 가변 유저 상태. */
export interface MutableUser {
  /** 유저 식별자. */
  id: string
  /** 적용 프로파일. */
  profile: PlayProfile
  /** 접속 위상 오프셋 (tick). */
  phaseOffset: number
  /** 보유 현금. */
  money: bigint
  /** 현재 레벨. */
  level: number
  /** 레벨 내 누적 XP. */
  xpInLevel: bigint
  /** 창고 등급. */
  warehouseGrade: number
  /** 창고 재고. */
  stacks: MaterialBag
  /** 보유 공장. */
  factories: MutableFactory[]
  /** 이번 주 누적 판매 수익(gross) — 주간 세금 과세 베이스. */
  weeklyRevenue: bigint
  /** 오늘 직구매 누적 수량. */
  directBuyToday: number
  /** 직전 수확이 창고 한도에 막혔는지 — 창고 업그레이드 우선순위 판단용. */
  warehouseChoked: boolean
  /** 공장 id 채번 시퀀스. */
  factorySeq: number
}

/** 내부 가변 마켓 엔트리. */
export interface MutableMarketEntry {
  /** 기준가 (불변 앵커). */
  basePrice: bigint
  /** 현재가. */
  currentPrice: bigint
  /** 이번 30분 윈도 누적 거래량. */
  recentSales: number
  /** 거래량 EMA. */
  avgSales: number
}

/**
 * 시나리오로부터 초기 유저 목록을 만든다.
 *
 * 프로파일은 라운드로빈 배정하고, 접속 위상은 유저 인덱스를 프로파일의 접속
 * 간격으로 나눈 나머지로 분산한다 — 전원이 같은 tick 에 수확·판매하면 30분
 * 가격 tick 의 `recentSales` 가 톱니처럼 튀어 demandFactor 가 왜곡된다.
 *
 * 시작 상태는 온보딩 직후를 모사한다: 현금 `STARTING_MONEY`, 공장 0채,
 * 창고 1등급, 레벨 1 (docs/design/00-onboarding.md §초기 지급). 첫 접속
 * tick 에 재투자 로직이 첫 공장을 짓는다.
 *
 * @param scenario 시뮬레이션 시나리오
 * @returns 가변 유저 배열
 */
export function createUsers(scenario: SimScenario): MutableUser[] {
  const kinds = scenario.profiles.length > 0 ? scenario.profiles : (['CASUAL'] as PlayProfileKind[])
  const users: MutableUser[] = []
  for (let i = 0; i < scenario.userCount; i += 1) {
    const profile = getPlayProfile(kinds[i % kinds.length]!)
    users.push({
      id: `u${i + 1}`,
      profile,
      phaseOffset: i % profile.sessionIntervalTicks,
      money: scenario.startingMoney,
      level: 1,
      xpInLevel: 0n,
      warehouseGrade: 1,
      stacks: {},
      factories: [],
      weeklyRevenue: 0n,
      directBuyToday: 0,
      warehouseChoked: false,
      factorySeq: 0,
    })
  }
  return users
}

/**
 * 초기 글로벌 마켓 상태를 만든다.
 *
 * 시드와 동일하게 `currentPrice = basePrice` 에서 출발한다
 * (packages/database/prisma/seed.ts 가 `currentPrice: basePrice` 로 upsert).
 * `avgSales` 는 0 에서 시작하므로 첫 30분 tick 의 demandFactor 는 U-5 가드에
 * 걸려 0 이다 — 노이즈만 적용된다 (docs/design/06-market.md §0-나눗셈 가드).
 *
 * @returns 자재 → 가변 마켓 엔트리 맵
 */
export function createMarket(): Map<MaterialType, MutableMarketEntry> {
  const market = new Map<MaterialType, MutableMarketEntry>()
  for (const [material, basePrice] of Object.entries(MARKET_BASE_PRICES)) {
    market.set(material as MaterialType, {
      basePrice,
      currentPrice: basePrice,
      recentSales: 0,
      avgSales: 0,
    })
  }
  return market
}

/**
 * 가변 유저를 읽기 전용 스냅샷으로 변환한다.
 *
 * @param user 가변 유저 상태
 * @returns 불변 스냅샷 (재고·공장 배열까지 복제)
 */
export function snapshotUser(user: MutableUser): SimUser {
  const factories: SimFactory[] = user.factories.map((f) => ({
    id: f.id,
    type: f.type,
    grade: f.grade,
    lastHarvestTick: f.lastHarvestTick,
  }))
  return {
    id: user.id,
    profile: user.profile,
    phaseOffset: user.phaseOffset,
    money: user.money,
    level: user.level,
    xpInLevel: user.xpInLevel,
    warehouseGrade: user.warehouseGrade,
    stacks: { ...user.stacks },
    factories,
    weeklyRevenue: user.weeklyRevenue,
    directBuyToday: user.directBuyToday,
  }
}

/**
 * 가변 마켓을 읽기 전용 스냅샷으로 변환한다.
 *
 * @param market 가변 마켓 맵
 * @returns 불변 스냅샷 맵
 */
export function snapshotMarket(
  market: ReadonlyMap<MaterialType, MutableMarketEntry>,
): Map<MaterialType, SimMarketEntry> {
  const out = new Map<MaterialType, SimMarketEntry>()
  for (const [material, entry] of market) {
    out.set(material, {
      basePrice: entry.basePrice,
      currentPrice: entry.currentPrice,
      recentSales: entry.recentSales,
      avgSales: entry.avgSales,
    })
  }
  return out
}

/**
 * 현재 시세를 `evaluateTotalAssets` 가 받는 형태(`ReadonlyMap`)로 뽑는다.
 *
 * @param market 가변 마켓 맵
 * @returns 자재 → 현재가 맵
 */
export function priceMap(
  market: ReadonlyMap<MaterialType, MutableMarketEntry>,
): Map<MaterialType, bigint> {
  const out = new Map<MaterialType, bigint>()
  for (const [material, entry] of market) out.set(material, entry.currentPrice)
  return out
}
