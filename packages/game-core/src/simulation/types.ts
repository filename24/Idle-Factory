/**
 * 경제 밸런스 시뮬레이터 도메인 타입 (#31).
 *
 * 시뮬레이터는 DB·네트워크 없이 game-core 순수 함수만 조립해 유저 M명 × N일의
 * 경제를 10분 tick 단위로 굴린다. 여기 정의된 타입은 전부 값 객체이며 Prisma
 * 엔터티가 아니다 — 런타임 상태와 1:1 대응하지 않는 **모델링용 축약**임에
 * 유의할 것 (괴리 목록은 `docs/design/`이 아니라 리포트의 "모델 한계" 절에
 * 명시된다).
 *
 * 참조: docs/design/02-core-loop.md(10분 tick), 04-economy.md(직구매),
 *       06-market.md(30분 가격 tick·유저 상점 세율), 07-global-system.md(주간 세금)
 */

import type { FactoryType, MaterialBag, MaterialType } from '../types'

/**
 * 플레이 프로파일 종류.
 *
 * 이슈 #31 §시나리오 정의의 3분류 — 접속 빈도와 재투자 성향이 다르다.
 *  - `HARDCORE`: 10분마다 수확·즉시 재투자
 *  - `CASUAL`: 하루 2~3회 접속
 *  - `IDLE`: 하루 1회 접속 (창고 병목을 정면으로 맞는 축)
 */
export type PlayProfileKind = 'HARDCORE' | 'CASUAL' | 'IDLE'

/** 플레이 프로파일 정의 — 접속 주기와 경제 행동 성향. */
export interface PlayProfile {
  /** 프로파일 종류 키. */
  readonly kind: PlayProfileKind
  /** 리포트 표기용 한국어 라벨. */
  readonly label: string
  /**
   * 접속 간격 (tick). 1 tick = 10분 (`TICK_MS`).
   * 예: 하루 1회 접속 → 144.
   */
  readonly sessionIntervalTicks: number
  /**
   * 수확 후 보유 현금 중 재투자에 쓰는 비율 (0.0 ~ 1.0).
   * 나머지는 현금으로 쌓여 총자산 누진세 구간을 밀어 올린다.
   */
  readonly reinvestRatio: number
  /**
   * 판매 물량 중 **유저 상점**으로 파는 비중 (0.0 ~ 1.0).
   * 나머지는 글로벌 마켓 즉시 판매다. 이 비중이 통화 발행량을 좌우한다 —
   * 글로벌 판매는 시스템이 화폐를 **발행**하지만 유저 상점 거래는 유저 간
   * **이전**이라 총량이 늘지 않고 세금만 소각되기 때문이다.
   */
  readonly shopSellRatio: number
  /** 유저 상점 등록 기간(일) — 기간별 세율(3~18%)을 결정한다. */
  readonly listingDurationDays: number
}

/** 시뮬레이션 안의 공장 한 채. */
export interface SimFactory {
  /** 시뮬레이터 내부 식별자 (시너지 계산 키로도 쓴다). */
  readonly id: string
  /** 공장 종류. */
  readonly type: FactoryType
  /** 현재 등급 (1..10). */
  readonly grade: number
  /** 마지막으로 수확한 tick 인덱스. */
  readonly lastHarvestTick: number
}

/** 시뮬레이션 안의 유저 한 명. */
export interface SimUser {
  /** 유저 식별자. */
  readonly id: string
  /** 적용 프로파일. */
  readonly profile: PlayProfile
  /** 접속 위상 오프셋 (tick) — 전 유저가 같은 tick 에 몰리지 않게 분산한다. */
  readonly phaseOffset: number
  /** 보유 현금. */
  readonly money: bigint
  /** 현재 레벨. */
  readonly level: number
  /** 현재 레벨 내 누적 XP. */
  readonly xpInLevel: bigint
  /** 창고 등급 (1..10). */
  readonly warehouseGrade: number
  /** 창고 재고. */
  readonly stacks: MaterialBag
  /** 보유 공장 목록. */
  readonly factories: readonly SimFactory[]
  /** 이번 주 누적 판매 수익 (gross) — 주간 세금 과세 베이스. */
  readonly weeklyRevenue: bigint
  /** 오늘 직구매한 총 수량 — 레벨별 일일 한도 소진 추적. */
  readonly directBuyToday: number
}

/** 자재 한 종의 글로벌 마켓 상태. */
export interface SimMarketEntry {
  /** 기준가 — 가격 진동의 앵커 (변하지 않는다). */
  readonly basePrice: bigint
  /** 현재가. */
  readonly currentPrice: bigint
  /** 이번 30분 윈도의 누적 거래량. */
  readonly recentSales: number
  /** 거래량 EMA. */
  readonly avgSales: number
}

/** 글로벌 마켓 전체 상태 — 자재 → 시세. */
export type SimMarket = ReadonlyMap<MaterialType, SimMarketEntry>

/**
 * 경제 파라미터 — 스윕 대상 축.
 *
 * 각 값의 기본값은 game-core 상수(설계 문서 확정값)와 일치한다. 스윕은 이
 * 구조체만 흔들어 인플레율 민감도를 본다 (이슈 #31 §파라미터 스윕).
 */
export interface EconomyParams {
  /** 가격 노이즈 절대값 상한. 기본 `PRICE_NOISE_LIMIT`(0.2). */
  readonly noiseLimit: number
  /** 수요 보정 계수 k. 기본 `DEFAULT_DEMAND_COEFFICIENT`(0.1). */
  readonly demandCoefficient: number
  /** 서버 가산세 (0.0 ~ 0.2) — 주간 세금 유효 세율에 더해진다. */
  readonly taxSurcharge: number
  /** 직구매 단가 배율. 기본 2 (`DIRECT_BUY_PRICE_MULTIPLIER`). */
  readonly directBuyMultiplier: number
}

/** 시뮬레이션 시나리오 정의. */
export interface SimScenario {
  /** 시나리오 식별자 — 리포트/CSV 파일명 키. */
  readonly id: string
  /** 유저 수 (M). */
  readonly userCount: number
  /** 시뮬레이션 기간 (일, N). */
  readonly days: number
  /** 유저에게 배정할 프로파일 목록 — 라운드로빈으로 순환 배정한다. */
  readonly profiles: readonly PlayProfileKind[]
  /** 결정론적 RNG 시드. */
  readonly seed: number
  /** 경제 파라미터. */
  readonly params: EconomyParams
  /** 유저 1인의 시작 자금. */
  readonly startingMoney: bigint
}

/** 한 tick 의 화폐 흐름 스냅샷. */
export interface TickFlow {
  /** tick 인덱스 (0-based). */
  readonly tick: number
  /** 이 tick 에 시스템이 발행한 화폐 (글로벌 마켓 판매 대금). */
  readonly minted: bigint
  /** 이 tick 에 소각된 화폐 (세금·수수료·직구매·건설/업그레이드 비용). */
  readonly burned: bigint
  /** tick 종료 시점 전 유저 현금 총합. */
  readonly moneySupply: bigint
}

/**
 * 하루 경계의 집계 스냅샷.
 *
 * 총자산 평가(`evaluateTotalAssets`)는 유저마다 공장·재고를 순회하므로 매
 * tick 계산하면 루프 비용을 지배한다. 인플레율 판단에 필요한 해상도는 일간이면
 * 충분하므로 하루 경계에서만 찍는다.
 */
export interface DailySnapshot {
  /** 1-based 일차. */
  readonly day: number
  /** 이 날 발행된 화폐 합계. */
  readonly minted: bigint
  /** 이 날 소각된 화폐 합계. */
  readonly burned: bigint
  /** 하루 종료 시점 현금 총량. */
  readonly moneySupply: bigint
  /** 하루 종료 시점 총자산 합 (현금 + 재고 평가 + 공장 누적 투자비). */
  readonly totalAssets: bigint
  /**
   * 전일 대비 통화량 증가율. 첫날은 기준이 없으므로 0.
   * `(오늘 − 어제) / 어제` — 어제가 0 이면 0 (0-나눗셈 가드).
   */
  readonly inflationRate: number
  /** 하루 종료 시점 유저 평균 레벨. */
  readonly averageLevel: number
}

/** 소각 원인별 분해 — 어떤 싱크가 실제로 작동하는지 보기 위한 집계. */
export interface BurnBreakdown {
  /** 주간 자산 누진세. */
  readonly weeklyTax: bigint
  /** 유저 상점 기간별 판매 세율. */
  readonly listingTax: bigint
  /** 자재 직구매 지출. */
  readonly directBuy: bigint
  /** 공장 신축·업그레이드 비용. */
  readonly construction: bigint
  /** 창고 업그레이드 비용. */
  readonly warehouse: bigint
}

/** 티어 해금 도달 기록. */
export interface TierMilestone {
  /** 도달한 레벨 문턱 (T2=5, T3=10). */
  readonly level: number
  /** 최초 도달 tick. 아무도 도달하지 못했으면 null. */
  readonly firstReachedTick: number | null
  /** 시뮬레이션 종료 시점에 도달한 유저 수. */
  readonly usersReached: number
}

/** 자재 가격 궤적 한 점. */
export interface PriceSample {
  /** tick 인덱스. */
  readonly tick: number
  /** 자재별 현재가. */
  readonly prices: Readonly<Record<string, bigint>>
}

/** 시뮬레이션 실행 결과 전체. */
export interface SimResult {
  /** 실행에 쓰인 시나리오. */
  readonly scenario: SimScenario
  /** tick 별 화폐 흐름 (전 tick). */
  readonly flows: readonly TickFlow[]
  /** 일간 집계 스냅샷. */
  readonly daily: readonly DailySnapshot[]
  /** 30분 가격 tick 마다의 가격 스냅샷. */
  readonly priceTrail: readonly PriceSample[]
  /** 소각 원인별 누적. */
  readonly burns: BurnBreakdown
  /** 티어 해금 도달 기록. */
  readonly milestones: readonly TierMilestone[]
  /** 종료 시점 유저 상태. */
  readonly users: readonly SimUser[]
  /** 종료 시점 마켓 상태. */
  readonly market: SimMarket
}
