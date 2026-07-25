/**
 * 시뮬레이션 지표 집계 (#31 §산출 지표).
 *
 * 엔진이 남긴 원시 기록(tick 흐름·일간 스냅샷·가격 궤적)을 리포트와 CSV 가
 * 바로 쓸 수 있는 형태로 요약·샘플링한다. 여기서는 판단하지 않는다 —
 * 목표치 대조는 `targets.ts` 소관이다.
 */

import type { MaterialType } from '../types'
import type { BurnBreakdown, PlayProfileKind, SimResult } from './types'

/** 시뮬레이션 한 건의 요약 지표. */
export interface SimSummary {
  /** 시나리오 id. */
  readonly scenarioId: string
  /** 유저 수. */
  readonly userCount: number
  /** 기간 (일). */
  readonly days: number
  /** 시작 자금 총합. */
  readonly seedMoney: bigint
  /** 종료 시점 통화 총량. */
  readonly finalSupply: bigint
  /** 총 발행액 (글로벌 판매 대금). */
  readonly totalMinted: bigint
  /** 총 소각액. */
  readonly totalBurned: bigint
  /** 소각/발행 비율. 발행이 0 이면 0. */
  readonly sinkRatio: number
  /** 일간 인플레율 평균 (첫날 제외). */
  readonly averageInflation: number
  /** 소각 원인별 분해. */
  readonly burns: BurnBreakdown
  /** 종료 시점 평균 레벨. */
  readonly averageLevel: number
  /** 종료 시점 총자산 합. */
  readonly finalAssets: bigint
  /** T2(Lv.5)·T3(Lv.10) 도달 요약. */
  readonly tierReach: ReadonlyArray<{
    readonly level: number
    readonly firstReachedTick: number | null
    readonly usersReached: number
  }>
}

/** 통화량 시계열 한 점. */
export interface SupplyPoint {
  /** 1-based 일차. */
  readonly day: number
  /** 통화 총량. */
  readonly supply: bigint
  /** 총자산 합. */
  readonly assets: bigint
  /** 전일 대비 통화량 증가율 (%). */
  readonly inflationPercent: number
}

/** 발행/소각 시계열 한 점. */
export interface FlowPoint {
  /** 1-based 일차. */
  readonly day: number
  /** 그날 발행액. */
  readonly minted: bigint
  /** 그날 소각액. */
  readonly burned: bigint
  /** 순증(발행 − 소각). */
  readonly net: bigint
}

/** 자재 가격 시계열. */
export interface PriceSeries {
  /** 자재 종류. */
  readonly material: MaterialType
  /** 기준가 — 진동 중심선. */
  readonly basePrice: bigint
  /** 샘플링된 가격 점. */
  readonly points: ReadonlyArray<{ readonly tick: number; readonly price: bigint }>
}

/** 프로파일별 자산 곡선. */
export interface ProfileSeries {
  /** 프로파일 종류. */
  readonly kind: PlayProfileKind
  /** 일차별 총자산. */
  readonly assets: readonly bigint[]
  /** T2 최초 도달 tick (없으면 null). */
  readonly tier2Tick: number | null
  /** T3 최초 도달 tick (없으면 null). */
  readonly tier3Tick: number | null
}

/**
 * 시뮬레이션 결과를 요약한다.
 *
 * @param result 시뮬레이션 결과
 * @returns 요약 지표
 */
export function summarize(result: SimResult): SimSummary {
  const totalMinted = result.flows.reduce((sum, flow) => sum + flow.minted, 0n)
  const totalBurned = result.flows.reduce((sum, flow) => sum + flow.burned, 0n)
  const last = result.daily.at(-1)

  const inflationSamples = result.daily.slice(1)
  const averageInflation =
    inflationSamples.length > 0
      ? inflationSamples.reduce((sum, day) => sum + day.inflationRate, 0) / inflationSamples.length
      : 0

  return {
    scenarioId: result.scenario.id,
    userCount: result.scenario.userCount,
    days: result.scenario.days,
    seedMoney: result.scenario.startingMoney * BigInt(result.scenario.userCount),
    finalSupply: result.users.reduce((sum, user) => sum + user.money, 0n),
    totalMinted,
    totalBurned,
    sinkRatio: totalMinted > 0n ? Number(totalBurned) / Number(totalMinted) : 0,
    averageInflation,
    burns: result.burns,
    averageLevel: last?.averageLevel ?? 1,
    finalAssets: last?.totalAssets ?? 0n,
    tierReach: result.milestones.map((milestone) => ({
      level: milestone.level,
      firstReachedTick: milestone.firstReachedTick,
      usersReached: milestone.usersReached,
    })),
  }
}

/**
 * 통화량·총자산·인플레율 일간 시계열을 뽑는다.
 *
 * @param result 시뮬레이션 결과
 * @returns 일차별 통화량 점
 */
export function supplySeries(result: SimResult): SupplyPoint[] {
  return result.daily.map((day) => ({
    day: day.day,
    supply: day.moneySupply,
    assets: day.totalAssets,
    inflationPercent: day.inflationRate * 100,
  }))
}

/**
 * 일간 발행 vs 소각 시계열을 뽑는다.
 *
 * @param result 시뮬레이션 결과
 * @returns 일차별 발행/소각 점
 */
export function flowSeries(result: SimResult): FlowPoint[] {
  return result.daily.map((day) => ({
    day: day.day,
    minted: day.minted,
    burned: day.burned,
    net: day.minted - day.burned,
  }))
}

/**
 * 자재별 가격 궤적을 샘플링해서 뽑는다.
 *
 * 30일 시나리오의 가격 tick 은 1,440점이라 차트에 그대로 넣을 수 없다.
 * 균등 간격으로 `maxPoints` 개까지 솎아 내되 **마지막 점은 항상 포함**한다 —
 * 종가가 빠지면 궤적의 결론이 사라지기 때문이다.
 *
 * @param result 시뮬레이션 결과
 * @param materials 대상 자재 (생략 시 T1 원자재 4종)
 * @param maxPoints 최대 표본 수 (기본 40)
 * @returns 자재별 가격 시계열
 */
export function priceSeries(
  result: SimResult,
  materials: readonly MaterialType[] = ['GRAIN', 'ORE', 'WOOD', 'CRUDE_OIL'],
  maxPoints = 40,
): PriceSeries[] {
  const trail = result.priceTrail
  if (trail.length === 0) return []

  const step = Math.max(1, Math.ceil(trail.length / maxPoints))
  const indices: number[] = []
  for (let i = 0; i < trail.length; i += step) indices.push(i)
  if (indices.at(-1) !== trail.length - 1) indices.push(trail.length - 1)

  return materials.map((material) => ({
    material,
    basePrice: result.market.get(material)?.basePrice ?? 0n,
    points: indices.map((index) => {
      const sample = trail[index]!
      return { tick: sample.tick, price: sample.prices[material] ?? 0n }
    }),
  }))
}

/**
 * 프로파일별 단독 시뮬레이션 결과를 자산 곡선으로 정렬한다.
 *
 * 입력은 프로파일 하나짜리 시나리오 결과여야 한다 — 혼합 시나리오는 유저마다
 * 프로파일이 달라 곡선 하나로 요약할 수 없다. 프로파일이 섞인 결과는 건너뛴다.
 *
 * @param results 프로파일 단독 시뮬레이션 결과들
 * @returns 프로파일별 자산 곡선
 */
export function profileSeries(results: readonly SimResult[]): ProfileSeries[] {
  const series: ProfileSeries[] = []
  for (const result of results) {
    if (result.scenario.profiles.length !== 1) continue
    const kind = result.scenario.profiles[0]!
    series.push({
      kind,
      assets: result.daily.map((day) => day.totalAssets),
      tier2Tick: result.milestones.find((m) => m.level === 5)?.firstReachedTick ?? null,
      tier3Tick: result.milestones.find((m) => m.level === 10)?.firstReachedTick ?? null,
    })
  }
  return series
}
