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

  it('농장 기준으로는 목표(16시간)를 충족한다', () => {
    const farm = checks.find((check) => check.id === 'warehouse-farm')
    expect(farm?.pass).toBe(true)
    expect(farm?.actual).toBe('16.7시간')
  })

  it('산출 개수가 적은 광산·유정은 병목이 훨씬 늦게 온다 (설계 의도 미달)', () => {
    // 창고 용량은 개수 기준이라 단가가 비싼 저(低)산출 공장은 창고를 늦게 채운다.
    // "접속 유도" 설계가 이 공장들에는 작동하지 않는다는 뜻 — 밸런스 조정 근거.
    expect(checks.find((check) => check.id === 'warehouse-mine')?.pass).toBe(false)
    expect(checks.find((check) => check.id === 'warehouse-oil_well')?.actual).toBe('62.5시간')
  })
})

describe('모순 7 — T2/T3 수익 배수 재검증', () => {
  const checks = checkTierMultiplier()

  it('문서의 "T1 대비 2~3배" 주장이 성립하지 않는다', () => {
    expect(checks.every((check) => !check.pass)).toBe(true)
  })

  it('T2 는 공장 단위로 T1 의 0.55배에 그친다', () => {
    expect(checks.find((c) => c.id === 'tier-multiplier-t2')?.actual).toBe('0.55배')
  })

  it('T3 는 2×2 점유 탓에 칸 단위로 T1 의 0.22배까지 떨어진다', () => {
    expect(checks.find((c) => c.id === 'tier-multiplier-per-cell-t3')?.actual).toBe('0.22배')
  })
})

describe('모순 11 — 튜토리얼 Q4 자금', () => {
  it('Q4 시점 현금 2,000원으로 3,000원 업그레이드를 못 한다 (1,000원 부족)', () => {
    const [check] = checkTutorialQuestFunding()
    expect(check!.pass).toBe(false)
    expect(check!.actual).toBe('2000원')
    expect(check!.target).toBe('≥ 3000원')
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
