/**
 * 목표치 검증기(`src/simulation/targets.ts`)·지표 집계(`metrics.ts`) 단위 테스트.
 *
 * 이 테스트가 **CI 회귀 게이트**다. 카탈로그·기준가·비용표 중 하나라도 바뀌면
 * 여기서 먼저 깨진다. 다만 현재 실패 중인 목표치(모순 7·11, 창고 병목)는
 * "설계와 코드가 어긋나 있다"는 사실 자체를 고정한 것이므로, 설계를 고쳐
 * 통과하게 만들 때 이 기대값도 함께 갱신해야 한다.
 */

import { describe, expect, it } from 'vitest'
import {
  buildScenario,
  checkBreakEven,
  checkSimulated,
  checkStaticTargets,
  checkT1Revenue,
  checkTierMultiplier,
  checkTutorialQuestFunding,
  checkWarehouseBottleneck,
  checkWarehouseValueDensity,
  flowSeries,
  grossRevenuePerTick,
  netProfitPerTick,
  priceSeries,
  profileSeries,
  runSimulation,
  summarize,
  supplySeries,
  TARGET_REVENUE_MAX,
  TARGET_REVENUE_MIN,
} from '../../src'

describe('T1 tick당 수익 (300~400원)', () => {
  it('T1 4종이 모두 목표 범위를 충족한다', () => {
    const checks = checkT1Revenue()
    expect(checks).toHaveLength(4)
    expect(checks.every((check) => check.pass)).toBe(true)
  })

  it('실제 수치가 설계 문서 표와 일치한다', () => {
    expect(grossRevenuePerTick('FARM')).toBe(300n)
    expect(grossRevenuePerTick('MINE')).toBe(300n)
    expect(grossRevenuePerTick('LUMBER')).toBe(375n)
    expect(grossRevenuePerTick('OIL_WELL')).toBe(400n)
  })

  it('T1 은 레시피가 없어 총 산출액 = 순수익이다', () => {
    for (const type of ['FARM', 'MINE', 'LUMBER', 'OIL_WELL'] as const) {
      expect(netProfitPerTick(type)).toBe(grossRevenuePerTick(type))
    }
  })
})

describe('손익분기 33분', () => {
  it('T1 4종이 모두 3.34 tick 이내에 원금을 회수한다', () => {
    expect(checkBreakEven().every((check) => check.pass)).toBe(true)
  })
})

describe('창고 1등급 병목 16시간', () => {
  const checks = checkWarehouseBottleneck()

  it('T1 4종이 모두 목표 범위(12~20시간)에 든다', () => {
    // 부피 계수 도입 전에는 광산 33.3h·유정 62.5h 로 목표를 크게 벗어났다.
    // ORE ×2 / CRUDE_OIL ×5 계수가 개수 기준 용량의 왜곡을 보정한다 (#21 결정 4).
    expect(checks).toHaveLength(4)
    expect(checks.every((check) => check.pass)).toBe(true)
  })

  it('공장별 포화 시간이 설계 의도대로 수렴한다', () => {
    const actual = Object.fromEntries(checks.map((check) => [check.id, check.actual]))
    expect(actual['warehouse-farm']).toBe('16.7시간')
    expect(actual['warehouse-mine']).toBe('16.7시간')
    expect(actual['warehouse-lumber']).toBe('20.0시간')
    expect(actual['warehouse-oil_well']).toBe('12.5시간')
  })

  it('목표 초과 안내 note 가 더 이상 붙지 않는다', () => {
    expect(checks.every((check) => check.note === undefined)).toBe(true)
  })
})

describe('모순 7 폐기 — 티어 수익 배수는 참고 지표다 (#21 결정 3)', () => {
  const checks = checkTierMultiplier()

  it('배수는 더 이상 합격/불합격을 가르지 않는다', () => {
    // 폐기 근거: 칸 단위 2배를 맞추면 T3 공장 단위가 15.35배가 되어 같은 문서의
    // "2~3배" 상한을 스스로 위반한다 — 두 지표를 동시에 만족시킬 수 없다.
    expect(checks.every((check) => check.pass)).toBe(true)
    expect(checks.every((check) => check.target.includes('참고 지표'))).toBe(true)
  })

  it('실측 배수는 회귀 감시용으로 계속 낸다', () => {
    expect(checks.find((c) => c.id === 'tier-multiplier-t2')?.actual).toBe('0.55배')
    expect(checks.find((c) => c.id === 'tier-multiplier-per-cell-t3')?.actual).toBe('0.22배')
  })
})

describe('티어의 새 가치 — 창고 1칸당 가치 (#21 결정 3·4)', () => {
  const checks = checkWarehouseValueDensity()

  it('T2·T3 는 T1 보다 창고 1칸을 값어치 있게 쓴다', () => {
    expect(checks).toHaveLength(2)
    expect(checks.every((check) => check.pass)).toBe(true)
  })

  it('부피 계수를 T1 에만 준 덕에 우위가 유지된다', () => {
    // T1 평균 밀도: GRAIN 10/1, ORE 20/2, WOOD 15/1, CRUDE_OIL 50/5 → 평균 11.25
    // T2 평균: STEEL 50, FUEL 80, PROCESSED_FOOD 25, FURNITURE 60 → 평균 53.75
    const t2 = checks.find((c) => c.id === 'warehouse-value-density-t2')
    expect(t2?.actual).toBe('4.78배')
  })
})

describe('모순 11 — 튜토리얼 Q4 자금 (#21 결정 2)', () => {
  it('부족분 1,000원을 수확·판매 4 tick(40분)으로 자력 조달한다', () => {
    const [check] = checkTutorialQuestFunding()
    expect(check!.pass).toBe(true)
    expect(check!.actual).toBe('40분 (수확·판매 4 tick)')
    expect(check!.target).toBe('≤ 60분')
  })

  it('보상만으로는 모자란다는 사실을 note 에 남긴다', () => {
    const [check] = checkTutorialQuestFunding()
    expect(check!.note).toContain('2000원')
    expect(check!.note).toContain('1000원이 부족')
  })
})

describe('checkStaticTargets', () => {
  it('모든 검증이 근거 문서를 명시한다', () => {
    for (const check of checkStaticTargets()) {
      expect(check.source, check.id).toMatch(/docs\/design\//)
    }
  })

  it('검증 id 가 중복되지 않는다', () => {
    const ids = checkStaticTargets().map((check) => check.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('시뮬레이션 실측 검증', () => {
  const result = runSimulation(buildScenario({ userCount: 5, days: 7 }))

  it('공장·tick당 발행액을 산출한다 (분모가 공장·tick 이다)', () => {
    const check = checkSimulated(result).find((c) => c.id === 'sim-revenue-per-tick')
    expect(check).toBeDefined()
    expect(result.productionTicks).toBeGreaterThan(0)
  })

  it('발행액을 생산 tick 으로 나눈 값이 등급 상승분만큼 목표를 넘어선다', () => {
    const perTick = Number(result.flows.reduce((s, f) => s + f.minted, 0n)) / result.productionTicks
    // 등급이 오르면 (3/2)^(g-1) 로 산출이 늘어나므로 등급1 목표 상한을 넘는 것이 정상이다.
    expect(perTick).toBeGreaterThan(Number(TARGET_REVENUE_MIN))
    expect(perTick).toBeGreaterThan(Number(TARGET_REVENUE_MAX))
  })
})

describe('지표 집계', () => {
  const result = runSimulation(buildScenario({ userCount: 5, days: 7 }))

  it('summarize 가 발행·소각·소각비율을 낸다', () => {
    const summary = summarize(result)
    expect(summary.scenarioId).toBe(result.scenario.id)
    expect(summary.totalMinted).toBeGreaterThan(0n)
    expect(summary.sinkRatio).toBeGreaterThan(0)
    expect(summary.seedMoney).toBe(1_000n * 5n)
  })

  it('supplySeries·flowSeries 가 일수만큼 점을 낸다', () => {
    expect(supplySeries(result)).toHaveLength(7)
    expect(flowSeries(result)).toHaveLength(7)
  })

  it('flowSeries 의 net 이 발행 − 소각과 같다', () => {
    for (const point of flowSeries(result)) {
      expect(point.net).toBe(point.minted - point.burned)
    }
  })

  it('priceSeries 가 표본 상한을 지키고 마지막 점을 포함한다', () => {
    const series = priceSeries(result, ['GRAIN', 'ORE'], 10)
    expect(series).toHaveLength(2)
    for (const line of series) {
      expect(line.points.length).toBeLessThanOrEqual(11)
      expect(line.points.at(-1)!.tick).toBe(result.priceTrail.at(-1)!.tick)
    }
  })

  it('profileSeries 는 단일 프로파일 시나리오만 받아들인다', () => {
    const single = ['HARDCORE', 'CASUAL', 'IDLE'].map((kind) =>
      runSimulation(buildScenario({ userCount: 1, days: 3, profiles: [kind as 'HARDCORE'] })),
    )
    expect(profileSeries(single)).toHaveLength(3)
    // 혼합 시나리오는 곡선 하나로 요약할 수 없으므로 제외된다.
    expect(profileSeries([result])).toHaveLength(0)
  })
})
