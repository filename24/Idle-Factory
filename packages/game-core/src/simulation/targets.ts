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
import { capacityOf, volumeOf } from '../warehouse/capacity'
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

/** 인플레 "수렴값" 을 재는 마지막 구간 길이 (일). */
export const CONVERGENCE_WINDOW_DAYS = 7

/**
 * 통화량 계열의 **기하평균** 일간 증가율.
 *
 * 일간 증가율의 산술평균을 쓰면 안 된다 (#21 결정 5). 주간 정산일에 통화량이
 * 대량 회수되면 그 다음날 회복률이 폭발적으로 잡히는데(실측 −92.8% → +1,145%),
 * 산술평균은 이 진동을 그대로 흡수해 "인플레 51%/일" 같은 거짓 신호를 낸다.
 * 같은 데이터의 기하평균은 13.3%/일이었고, 마지막 7일 수렴값은 3.5%/일이었다.
 *
 * 같은 이유로 이 함수는 "서버 가산세를 올리면 인플레가 526%로 폭증한다"는
 * 가짜 역설도 제거한다 — 실제로는 가산세 0.2 에서 최종 통화량이 21.5% 줄고
 * 소각비가 0.62→0.70 으로 개선된다. 세금은 설계대로 작동하고 있었다.
 *
 * @param supply 일 단위 통화량 계열 (앞에서 뒤로)
 * @returns 일간 기하평균 증가율. 계열이 2개 미만이거나 0 이 섞이면 `null`
 */
export function geometricInflation(supply: readonly bigint[]): number | null {
  if (supply.length < 2) return null
  const first = supply[0]!
  const last = supply[supply.length - 1]!
  if (first <= 0n || last <= 0n) return null
  return Math.pow(Number(last) / Number(first), 1 / (supply.length - 1)) - 1
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
 * 산출 **부피**(개수 × `volumeOf`)로 계산한다 — 창고 용량은 슬롯 단위이고
 * 자재마다 1 개가 차지하는 슬롯 수가 다르다
 * (docs/design/05-warehouse.md §용량 표·§부피 계수, #21 결정 4).
 *
 * @returns T1 공장 4종의 검증 결과
 */
export function checkWarehouseBottleneck(): TargetCheck[] {
  const capacity = capacityOf(1)
  return T1_TYPES.map((type) => {
    const entry = getFactoryEntry(type)
    let volumePerTick = entry.baseProduction * volumeOf(entry.output)
    for (const secondary of entry.secondaryOutputs) {
      volumePerTick += secondary.amount * volumeOf(secondary.material)
    }

    const ticks = Number(capacity) / Number(volumePerTick)
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
 * 티어 수익 배수 — **참고 지표** (목표치 아님).
 *
 * 문서(docs/design/00-onboarding.md L107)의 "T2/T3 는 T1 대비 2~3배 수익"
 * 주장은 #21 결정 3 에서 **폐기**했다. 폐기 근거는 산정으로 증명된 자기모순이다:
 * T3 는 2×2(4칸)를 점유하므로 공장 단위와 칸 단위 배수가 항상 4배 벌어지고,
 * 칸 단위 2배를 맞추면(완제품 기준가 CAR 500→6,300원) 공장 단위가 15.35배가
 * 되어 같은 문서가 정한 "2~3배" 상한을 스스로 위반한다. 두 지표를 동시에
 * 만족시키는 기준가 조합은 존재하지 않는다.
 *
 * 대신 T2/T3 의 가치는 **창고 부피 효율**(`checkWarehouseValueDensity`)·상장
 * 조건·XP·후반 싱크 독점으로 정의한다. 배수는 회귀 감시용으로만 남긴다 —
 * 값이 급변하면 카탈로그나 기준가가 흔들렸다는 신호다.
 *
 * @returns 티어 배수 참고 지표 (항상 pass)
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
      target: '참고 지표 (#21 결정 3 — 배수 목표 폐기)',
      actual: `${fixed(perFactory)}배`,
      pass: true,
      source: 'docs/design/00-onboarding.md §티어의 가치 (#21 결정 3)',
    })
    checks.push({
      id: `tier-multiplier-per-cell-${tier.toLowerCase()}`,
      label: `${tier} 평균 순수익 / T1 평균 (칸 단위)`,
      target: '참고 지표 (#21 결정 3 — 배수 목표 폐기)',
      actual: `${fixed(perCell)}배`,
      pass: true,
      source: 'docs/design/00-onboarding.md §티어의 가치 (#21 결정 3)',
      note:
        tier === 'T3'
          ? 'T3 는 2×2(4칸)를 점유해 칸당 수익이 낮다 — 가치는 창고 부피 효율로 회수한다.'
          : undefined,
    })
  }
  return checks
}

/**
 * 창고 1칸당 자재 가치 — #21 결정 3 이 T2/T3 의 새 가치로 지정한 축.
 *
 * 티어 수익 배수를 폐기한 대신, "가공할수록 창고 1칸이 더 값어치 있다"를
 * 감시 가능한 수치로 고정한다. 부피 계수(#21 결정 4)를 T1 에만 준 이유가
 * 바로 이 우위를 남기기 위함이므로, 이 검증이 깨지면 결정 3 과 결정 4 의
 * 정합이 무너졌다는 뜻이다.
 *
 * 티어 대표값은 각 티어 산출물의 `기준가 ÷ 부피 계수` 평균이다.
 *
 * @returns 티어별 창고 1칸당 가치 검증 결과
 */
export function checkWarehouseValueDensity(): TargetCheck[] {
  const densityOf = (tier: FactoryTier): number => {
    const types = typesOfTier(tier)
    const sum = types.reduce((acc, type) => {
      const entry = getFactoryEntry(type)
      return acc + Number(MARKET_BASE_PRICES[entry.output]) / Number(volumeOf(entry.output))
    }, 0)
    return sum / types.length
  }

  const t1 = densityOf('T1')

  return (['T2', 'T3'] as const).map((tier) => {
    const ratio = densityOf(tier) / t1
    return {
      id: `warehouse-value-density-${tier.toLowerCase()}`,
      label: `${tier} 창고 1칸당 가치 / T1`,
      target: '> 1배 (가공할수록 창고 효율 우위)',
      actual: `${fixed(ratio)}배`,
      pass: ratio > 1,
      source: 'docs/design/05-warehouse.md §부피 계수 (#21 결정 3·4)',
    }
  })
}

/** 설계 목표: Q4 부족분을 자력으로 메우는 데 허용되는 시간 (분). */
export const TARGET_Q4_SELF_FUNDING_MINUTES = 60

/**
 * 모순 11 재검증 — 튜토리얼 Q4 업그레이드 자금.
 *
 * **검증 기준이 #21 결정 2 에서 바뀌었다.** 이전에는 "퀘스트 보상만으로 Q4
 * 업그레이드 비용을 낼 수 있는가"를 물었고 1,000원 부족으로 실패했다. 그러나
 * Q3 는 `marketSell.ts` 의 글로벌 즉시판매로도 완료되며(체결 시 `MARKET_LISTED`
 * 발화), 그 경로는 **판매 대금을 즉시 현금으로 지급**한다. 즉 유저는 수확분을
 * 팔아 부족분을 스스로 메울 수 있고, Q4 에는 제한 시간이 없다.
 *
 * 따라서 진짜 위험은 "돈이 모자란다"가 아니라 "부족분을 메우는 데 너무 오래
 * 걸려 온보딩이 정체된다"다. 그래서 부족분 ÷ tick 당 판매 수입으로 **자력 조달
 * 소요 시간**을 재고, 1시간 이내면 통과로 본다.
 *
 * 보상만으로 모이는 현금(씨드 1,000 − 건설 1,000 + Q1 1,000 + Q2 500 + Q3 500
 * = 2,000원)은 `note` 에 함께 남겨 맥락을 잃지 않게 한다.
 *
 * @returns 자력 조달 시간 검증 결과
 */
export function checkTutorialQuestFunding(): TargetCheck[] {
  const seed = 1_000n
  const buildSpend = buildCost('FARM')
  const questRewards = 1_000n + 500n + 500n // Q1 + Q2 + Q3
  const cashAtQ4 = seed - buildSpend + questRewards
  const upgradeCost = upgradeMoneyCost('FARM', 1)
  const shortfall = upgradeCost > cashAtQ4 ? upgradeCost - cashAtQ4 : 0n

  // Q1 이 요구하는 첫 공장은 T1 이고 튜토리얼은 농장을 전제한다
  // (docs/design/00-onboarding.md §튜토리얼 퀘스트 체인).
  const revenuePerTick = grossRevenuePerTick('FARM')
  const ticksNeeded = shortfall === 0n ? 0 : Math.ceil(Number(shortfall) / Number(revenuePerTick))
  const minutesNeeded = ticksNeeded * TICK_MINUTES

  return [
    {
      id: 'tutorial-q4-funding',
      label: 'Q4 부족분 자력 조달 시간',
      target: `≤ ${TARGET_Q4_SELF_FUNDING_MINUTES}분`,
      actual:
        shortfall === 0n
          ? '0분 (보상만으로 충족)'
          : `${fixed(minutesNeeded, 0)}분 (수확·판매 ${ticksNeeded} tick)`,
      pass: minutesNeeded <= TARGET_Q4_SELF_FUNDING_MINUTES,
      source: 'docs/design/00-onboarding.md §Q4 자금 조달 (#21 결정 2)',
      note:
        shortfall > 0n
          ? `보상만으로는 ${cashAtQ4}원 — ${shortfall}원이 부족하다. 글로벌 즉시판매(Q3 완료 경로)로 메운다.`
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
  const sinkRatio = totalMinted > 0n ? Number(totalBurned) / Number(totalMinted) : 0

  const supply = result.daily.map((day) => day.moneySupply)
  const whole = geometricInflation(supply)
  const late = geometricInflation(supply.slice(Math.floor(supply.length / 2)))
  const converged = geometricInflation(supply.slice(-CONVERGENCE_WINDOW_DAYS))

  const checks: TargetCheck[] = [
    {
      id: 'sim-revenue-per-tick',
      label: '실측 공장·tick당 발행액',
      target: `참고 지표 (등급1 앵커는 ${TARGET_REVENUE_MIN}~${TARGET_REVENUE_MAX}원)`,
      actual: `${perFactoryTick}원`,
      pass: true,
      source: 'docs/design/00-onboarding.md §밸런스 기준 (#21 — 참고 지표로 강등)',
      note:
        '등급 배수 1.5^(등급−1) 가 곱해진 전 등급 평균이라 등급1 앵커와 직접 비교할 수 없다 ' +
        '(등급10 이면 앵커의 약 38배). 유저 상점 판매분은 이전이라 분자에서 빠진다.',
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
  ]

  // 인플레는 구간별로 크게 다르다 — 초반 램프업이 전 구간 평균을 끌어올리므로
  // 밸런스 판단은 수렴값으로 해야 한다 (#21 결정 5).
  const inflationRows: ReadonlyArray<{ id: string; label: string; value: number | null }> = [
    { id: 'sim-inflation-whole', label: '통화량 증가율 (전 구간, 기하평균)', value: whole },
    { id: 'sim-inflation-late', label: '통화량 증가율 (후반 절반, 기하평균)', value: late },
    {
      id: 'sim-inflation-converged',
      label: `통화량 증가율 (마지막 ${CONVERGENCE_WINDOW_DAYS}일, 기하평균)`,
      value: converged,
    },
  ]

  for (const row of inflationRows) {
    checks.push({
      id: row.id,
      label: row.label,
      target: '참고 지표',
      actual: row.value === null ? '산출 불가' : `${fixed(row.value * 100)}%/일`,
      pass: true,
      source: '#31 §산출 지표 (#21 결정 5 — 기하평균)',
      note:
        row.value === null
          ? '구간 내 통화량이 0 인 날이 있어 기하평균을 낼 수 없다 (소규모·단기 시나리오).'
          : undefined,
    })
  }

  return checks
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
    ...checkWarehouseValueDensity(),
    ...checkTierMultiplier(),
    ...checkTutorialQuestFunding(),
  ]
}
