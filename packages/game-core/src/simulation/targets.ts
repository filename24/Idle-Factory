/**
 * 설계 목표치 검증기 (#31 §검증 리포트).
 *
 * 두 종류의 검증을 낸다:
 *  1. **정적 검증** — 카탈로그와 기준가만으로 산출되는 값. 시뮬레이션 없이도
 *     설계 목표와 대조할 수 있어 회귀 게이트로 쓰기에 가장 안정적이다.
 *  2. **시뮬레이션 검증** — tick 루프를 실제로 돌려야 나오는 값(실측 tick당
 *     수익, 인플레율 등).
 *
 * 검증 대상 목표치:
 *  - 300~400원/tick (docs/design/00-onboarding.md §밸런스 기준)
 *  - 33분 손익분기 (같은 문서 — 신축 1,000원 ÷ 300원/tick = 3.3 tick)
 *  - 창고 1등급 ≈ 16시간 (docs/design/05-warehouse.md §설계 의도)
 *  - 모순 7: "T2/T3 는 T1 대비 2~3배 수익" (같은 문서 L107, #31 재서술 대상)
 *  - 모순 11: 튜토리얼 Q4 업그레이드 자금 부족 (같은 문서 L44, #31 재조정 대상)
 */

import { FACTORY_CATALOG, getFactoryEntry } from '../factories/catalog'
import { buildCost, upgradeMoneyCost } from '../factories/cost'
import { TICK_MS } from '../factories/production'
import { MARKET_BASE_PRICES } from '../market/basePrices'
import type { FactoryTier, FactoryType } from '../types'
import { capacityOf } from '../warehouse/capacity'
import type { SimResult } from './types'

/** 한 건의 목표치 대조 결과. */
export interface TargetCheck {
  /** 검증 식별자 — 리포트 표의 행 키. */
  readonly id: string
  /** 사람이 읽는 항목명. */
  readonly label: string
  /** 설계 목표 (문서 표기 그대로). */
  readonly target: string
  /** 실측값. */
  readonly actual: string
  /** 목표 충족 여부. */
  readonly pass: boolean
  /** 근거 문서 위치. */
  readonly source: string
  /** 추가 설명 — 실패 원인이나 해석 주의점. */
  readonly note?: string
}

/** T1 공장 목록 — 목표치 "300~400원/tick" 의 적용 대상. */
const T1_TYPES: readonly FactoryType[] = ['FARM', 'MINE', 'LUMBER', 'OIL_WELL']

/** 설계 목표: T1 등급1 tick 당 수익 하한. */
export const TARGET_REVENUE_MIN = 300n

/** 설계 목표: T1 등급1 tick 당 수익 상한. */
export const TARGET_REVENUE_MAX = 400n

/** 설계 목표: 손익분기 tick 수 (1,000원 ÷ 300원/tick ≈ 3.34). */
export const TARGET_BREAK_EVEN_TICKS = 1000 / 300

/** 설계 목표: 창고 1등급 병목 시간 (시간). */
export const TARGET_WAREHOUSE_HOURS = 16

/**
 * 창고 병목 허용 오차 — 문서 표기가 "약 16시간" 이므로 ±25% 를 통과로 본다.
 * 정확한 값은 공장 종류에 따라 달라진다(농장 16.7h, 유정 62.5h).
 */
const WAREHOUSE_TOLERANCE = 0.25

/** 1 tick 의 분 단위 길이 — `TICK_MS` 에서 유도. */
const TICK_MINUTES = TICK_MS / 60_000

/**
 * 공장 한 채의 등급1 tick 당 **총 산출액**(기준가 환산, 원료비 차감 전).
 *
 * T1 목표치 "300~400원/tick"(docs/design/00-onboarding.md §밸런스 기준)은
 * 원료를 쓰지 않는 T1 기준이라 총 산출액과 순수익이 같다.
 *
 * @param type 공장 종류
 * @returns tick 당 산출액 (bigint)
 */
export function grossRevenuePerTick(type: FactoryType): bigint {
  const entry = getFactoryEntry(type)
  let revenue = entry.baseProduction * MARKET_BASE_PRICES[entry.output]
  for (const secondary of entry.secondaryOutputs) {
    revenue += secondary.amount * MARKET_BASE_PRICES[secondary.material]
  }
  return revenue
}

/**
 * 공장 한 채의 등급1 tick 당 **순수익** (산출액 − 원료비, 기준가 환산).
 *
 * @param type 공장 종류
 * @returns tick 당 순수익 (bigint, 음수 가능)
 */
export function netProfitPerTick(type: FactoryType): bigint {
  const entry = getFactoryEntry(type)
  let profit = grossRevenuePerTick(type)
  for (const req of entry.recipe) {
    profit -= req.amount * MARKET_BASE_PRICES[req.material]
  }
  return profit
}

/** 공장 한 채가 점유하는 토지 칸 수. */
function cellsOf(type: FactoryType): bigint {
  const { size } = getFactoryEntry(type)
  return BigInt(size.width * size.height)
}

/** 티어별 공장 종류 목록. */
function typesOfTier(tier: FactoryTier): FactoryType[] {
  return (Object.keys(FACTORY_CATALOG) as FactoryType[]).filter(
    (type) => FACTORY_CATALOG[type].tier === tier,
  )
}

/** 티어 평균 순수익 (공장 단위). */
function averageNetProfit(tier: FactoryTier): bigint {
  const types = typesOfTier(tier)
  const sum = types.reduce((acc, type) => acc + netProfitPerTick(type), 0n)
  return sum / BigInt(types.length)
}

/** 티어 평균 칸당 순수익 — T3 는 2×2 를 차지하므로 공장 단위 비교는 불공정하다. */
function averageNetProfitPerCell(tier: FactoryTier): bigint {
  const types = typesOfTier(tier)
  const sum = types.reduce((acc, type) => acc + netProfitPerTick(type) / cellsOf(type), 0n)
  return sum / BigInt(types.length)
}

/** 소수 2자리 문자열. */
function fixed(value: number, digits = 2): string {
  return value.toFixed(digits)
}

/**
 * T1 등급1 tick 당 수익이 300~400원 범위인지 검증한다.
 *
 * @returns T1 공장 4종의 검증 결과
 */
export function checkT1Revenue(): TargetCheck[] {
  return T1_TYPES.map((type) => {
    const revenue = grossRevenuePerTick(type)
    return {
      id: `t1-revenue-${type.toLowerCase()}`,
      label: `${type} 등급1 tick당 수익`,
      target: `${TARGET_REVENUE_MIN}~${TARGET_REVENUE_MAX}원`,
      actual: `${revenue}원`,
      pass: revenue >= TARGET_REVENUE_MIN && revenue <= TARGET_REVENUE_MAX,
      source: 'docs/design/00-onboarding.md §밸런스 기준',
    }
  })
}

/**
 * 신축 손익분기가 33분(3.3 tick) 이내인지 검증한다.
 *
 * @returns T1 공장 4종의 검증 결과
 */
export function checkBreakEven(): TargetCheck[] {
  return T1_TYPES.map((type) => {
    const revenue = grossRevenuePerTick(type)
    const ticks = Number(buildCost(type)) / Number(revenue)
    return {
      id: `break-even-${type.toLowerCase()}`,
      label: `${type} 신축 손익분기`,
      target: `≤ ${fixed(TARGET_BREAK_EVEN_TICKS)} tick (33분)`,
      actual: `${fixed(ticks)} tick (${fixed(ticks * TICK_MINUTES, 1)}분)`,
      // 목표가 최저 수익(300원/tick) 기준 상한이므로, 그보다 빠르면 통과다.
      pass: ticks <= TARGET_BREAK_EVEN_TICKS + 0.01,
      source: 'docs/design/00-onboarding.md §밸런스 기준',
    }
  })
}

/**
 * 창고 1등급이 공장 1채 기준 약 16시간 만에 차는지 검증한다.
 *
 * 산출 **개수**(금액이 아니라 슬롯 점유량)로 계산한다 — 창고 용량은 개수
 * 단위이기 때문이다 (docs/design/05-warehouse.md §용량 표).
 *
 * @returns T1 공장 4종의 검증 결과
 */
export function checkWarehouseBottleneck(): TargetCheck[] {
  const capacity = capacityOf(1)
  return T1_TYPES.map((type) => {
    const entry = getFactoryEntry(type)
    let unitsPerTick = entry.baseProduction
    for (const secondary of entry.secondaryOutputs) unitsPerTick += secondary.amount

    const ticks = Number(capacity) / Number(unitsPerTick)
    const hours = (ticks * TICK_MINUTES) / 60
    const low = TARGET_WAREHOUSE_HOURS * (1 - WAREHOUSE_TOLERANCE)
    const high = TARGET_WAREHOUSE_HOURS * (1 + WAREHOUSE_TOLERANCE)

    return {
      id: `warehouse-${type.toLowerCase()}`,
      label: `${type} 1채 기준 창고1등급 포화`,
      target: `약 ${TARGET_WAREHOUSE_HOURS}시간 (±${WAREHOUSE_TOLERANCE * 100}%)`,
      actual: `${fixed(hours, 1)}시간`,
      pass: hours >= low && hours <= high,
      source: 'docs/design/05-warehouse.md §설계 의도',
      note:
        hours > high
          ? '산출 개수가 적어 창고가 늦게 찬다 — 접속 유도 설계가 이 공장에는 작동하지 않는다.'
          : undefined,
    }
  })
}

/**
 * 모순 7 재검증 — "T2/T3 는 T1 대비 2~3배 수익" 주장의 실측.
 *
 * 문서(docs/design/00-onboarding.md L107)는 이 배수를 "잠정"으로 표기하고
 * 시뮬레이터 결과로 재서술하라고 명시했다. 공장 단위와 **칸 단위** 둘 다
 * 낸다 — T3 는 2×2(4칸)를 차지하므로 공장 단위 비교는 토지 기회비용을
 * 감춘다 (docs/design/11-land.md §배치).
 *
 * @returns 티어 배수 검증 결과
 */
export function checkTierMultiplier(): TargetCheck[] {
  const t1 = averageNetProfit('T1')
  const t1PerCell = averageNetProfitPerCell('T1')

  const checks: TargetCheck[] = []
  for (const tier of ['T2', 'T3'] as const) {
    const perFactory = Number(averageNetProfit(tier)) / Number(t1)
    const perCell = Number(averageNetProfitPerCell(tier)) / Number(t1PerCell)

    checks.push({
      id: `tier-multiplier-${tier.toLowerCase()}`,
      label: `${tier} 평균 순수익 / T1 평균 (공장 단위)`,
      target: '2~3배',
      actual: `${fixed(perFactory)}배`,
      pass: perFactory >= 2,
      source: 'docs/design/00-onboarding.md L107 (모순 7, 잠정)',
      note:
        perFactory < 2
          ? `문서의 "2~3배" 주장이 성립하지 않는다. 칸 단위로는 ${fixed(perCell)}배.`
          : undefined,
    })
    checks.push({
      id: `tier-multiplier-per-cell-${tier.toLowerCase()}`,
      label: `${tier} 평균 순수익 / T1 평균 (칸 단위)`,
      target: '2~3배',
      actual: `${fixed(perCell)}배`,
      pass: perCell >= 2,
      source: 'docs/design/00-onboarding.md L107 (모순 7, 잠정)',
      note: tier === 'T3' ? 'T3 는 2×2(4칸)를 점유해 칸당 수익이 크게 떨어진다.' : undefined,
    })
  }
  return checks
}

/**
 * 모순 11 재검증 — 튜토리얼 Q4 업그레이드 자금 부족.
 *
 * 퀘스트 표(docs/design/00-onboarding.md §퀘스트 상세)의 누적 자금을 그대로
 * 재계산한다: 씨드 1,000 − 건설 1,000 + Q1 1,000 + Q2 500 + Q3 500 = 2,000원.
 * Q4 가 요구하는 1→2 업그레이드 비용은 `upgradeMoneyCost(type, 1)` 이다.
 *
 * @returns 자금 충족 여부 검증 결과
 */
export function checkTutorialQuestFunding(): TargetCheck[] {
  const seed = 1_000n
  const buildSpend = buildCost('FARM')
  const questRewards = 1_000n + 500n + 500n // Q1 + Q2 + Q3
  const cashAtQ4 = seed - buildSpend + questRewards
  const upgradeCost = upgradeMoneyCost('FARM', 1)

  return [
    {
      id: 'tutorial-q4-funding',
      label: 'Q4 시점 보유 현금 vs 업그레이드 비용',
      target: `≥ ${upgradeCost}원`,
      actual: `${cashAtQ4}원`,
      pass: cashAtQ4 >= upgradeCost,
      source: 'docs/design/00-onboarding.md L44 (모순 11)',
      note:
        cashAtQ4 < upgradeCost
          ? `${upgradeCost - cashAtQ4}원 부족 — Q3 는 마켓 *등록* 으로 완료되어 판매 대금이 보장되지 않는다.`
          : undefined,
    },
  ]
}

/**
 * 시뮬레이션 실측 기반 검증.
 *
 * 정적 검증이 "설계표대로면 이렇게 나온다"를 보는 것과 달리, 이쪽은 창고
 * 병목·접속 주기·가격 변동이 전부 얽힌 실제 흐름에서 tick 당 수익이 어디에
 * 수렴하는지 본다. 두 값이 벌어지면 그 간극이 곧 밸런스 손실 지점이다.
 *
 * @param result 시뮬레이션 결과
 * @returns 실측 검증 결과
 */
export function checkSimulated(result: SimResult): TargetCheck[] {
  const totalMinted = result.flows.reduce((sum, flow) => sum + flow.minted, 0n)
  const totalBurned = result.flows.reduce((sum, flow) => sum + flow.burned, 0n)

  // 목표치가 "공장 1채의 tick 당 수익"이므로 분모도 공장·tick 이어야 한다.
  const productionTicks = BigInt(result.productionTicks)
  const perFactoryTick = productionTicks > 0n ? totalMinted / productionTicks : 0n
  const avgInflation =
    result.daily.length > 1
      ? result.daily.slice(1).reduce((sum, day) => sum + day.inflationRate, 0) /
        (result.daily.length - 1)
      : 0
  const sinkRatio = totalMinted > 0n ? Number(totalBurned) / Number(totalMinted) : 0

  return [
    {
      id: 'sim-revenue-per-tick',
      label: '실측 공장·tick당 발행액',
      target: `${TARGET_REVENUE_MIN}~${TARGET_REVENUE_MAX}원 (설계 수렴값)`,
      actual: `${perFactoryTick}원`,
      pass: perFactoryTick >= TARGET_REVENUE_MIN && perFactoryTick <= TARGET_REVENUE_MAX,
      source: 'docs/design/00-onboarding.md §밸런스 기준',
      note: '유저 상점 판매분은 발행이 아니라 이전이므로 분자에서 빠진다 — shopSellRatio 가 높은 프로파일은 낮게 나온다.',
    },
    {
      id: 'sim-sink-ratio',
      label: '소각/발행 비율',
      target: '참고 지표 (1.0 이면 통화량 정체)',
      actual: fixed(sinkRatio),
      pass: true,
      source: '#31 §산출 지표',
      note: sinkRatio < 0.5 ? '싱크가 약해 통화량이 빠르게 늘어난다.' : undefined,
    },
    {
      id: 'sim-inflation',
      label: '일간 평균 인플레율',
      target: '참고 지표',
      actual: `${fixed(avgInflation * 100)}%/일`,
      pass: true,
      source: '#31 §산출 지표',
    },
  ]
}

/**
 * 정적 검증 전체를 모아 실행한다.
 *
 * @returns 목표치 검증 결과 배열
 */
export function checkStaticTargets(): TargetCheck[] {
  return [
    ...checkT1Revenue(),
    ...checkBreakEven(),
    ...checkWarehouseBottleneck(),
    ...checkTierMultiplier(),
    ...checkTutorialQuestFunding(),
  ]
}
