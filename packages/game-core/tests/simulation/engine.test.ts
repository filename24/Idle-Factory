/**
 * 시뮬레이션 엔진(`src/simulation/engine.ts`) 단위 테스트.
 *
 * 검증 축:
 *  - **화폐 회계 항등식**: 최종 통화량 = 시작 자금 + Σ발행 − Σ소각.
 *    유저 상점 거래는 유저 간 이전이라 총량에 영향을 주면 안 되므로, 이
 *    항등식이 깨지면 발행/소각 분류가 틀린 것이다.
 *  - 결정론: 같은 시나리오는 항상 같은 결과 (CI 회귀 게이트의 전제)
 *  - 프로파일 순서: 접속이 잦을수록 자산이 크다
 *  - 소각 분해 합 = 총 소각
 */

import { describe, expect, it } from 'vitest'
import { buildScenario, runSimulation, TICKS_PER_DAY, type SimResult } from '../../src'

/** 결과에서 총 발행액을 합산한다. */
function totalMinted(result: SimResult): bigint {
  return result.flows.reduce((sum, flow) => sum + flow.minted, 0n)
}

/** 결과에서 총 소각액을 합산한다. */
function totalBurned(result: SimResult): bigint {
  return result.flows.reduce((sum, flow) => sum + flow.burned, 0n)
}

/** 최종 유저 현금 총합. */
function finalSupply(result: SimResult): bigint {
  return result.users.reduce((sum, user) => sum + user.money, 0n)
}

describe('runSimulation — 기본 동작', () => {
  const scenario = buildScenario({ userCount: 1, days: 7, profiles: ['CASUAL'] })
  const result = runSimulation(scenario)

  it('tick 수가 일수 × 144 와 같다', () => {
    expect(result.flows.length).toBe(7 * TICKS_PER_DAY)
  })

  it('일간 스냅샷이 일수만큼 생긴다', () => {
    expect(result.daily.length).toBe(7)
    expect(result.daily[0]!.day).toBe(1)
    expect(result.daily.at(-1)!.day).toBe(7)
  })

  it('30분마다 가격 스냅샷을 남긴다 (tick/3)', () => {
    expect(result.priceTrail.length).toBe((7 * TICKS_PER_DAY) / 3)
  })

  it('유저가 공장을 지어 생산을 시작한다', () => {
    expect(result.users[0]!.factories.length).toBeGreaterThan(0)
  })

  it('레벨이 1보다 커진다 (XP 지급 경로가 살아 있다)', () => {
    expect(result.users[0]!.level).toBeGreaterThan(1)
  })
})

describe('화폐 회계 항등식', () => {
  it.each([
    ['1인 캐주얼', buildScenario({ userCount: 1, days: 7, profiles: ['CASUAL'] })],
    ['10인 혼합', buildScenario({ userCount: 10, days: 7 })],
    ['3인 하드코어', buildScenario({ userCount: 3, days: 3, profiles: ['HARDCORE'] })],
  ])('%s — 최종 통화량 = 시작자금 + 발행 − 소각', (_label, scenario) => {
    const result = runSimulation(scenario)
    const seed = scenario.startingMoney * BigInt(scenario.userCount)

    expect(finalSupply(result)).toBe(seed + totalMinted(result) - totalBurned(result))
  })

  it('유저 상점 거래가 있어도 총량이 보존된다 (이전은 발행이 아니다)', () => {
    // CASUAL 은 shopSellRatio 0.3 — 10인이면 구매자 매칭이 실제로 성사된다.
    const scenario = buildScenario({ userCount: 10, days: 7, profiles: ['CASUAL'] })
    const result = runSimulation(scenario)
    const seed = scenario.startingMoney * 10n

    expect(result.burns.listingTax).toBeGreaterThan(0n)
    expect(finalSupply(result)).toBe(seed + totalMinted(result) - totalBurned(result))
  })

  it('소각 분해의 합이 총 소각과 같다', () => {
    const result = runSimulation(buildScenario({ userCount: 10, days: 7 }))
    const { weeklyTax, listingTax, directBuy, construction, warehouse } = result.burns

    expect(weeklyTax + listingTax + directBuy + construction + warehouse).toBe(totalBurned(result))
  })

  it('마지막 flow 의 moneySupply 가 최종 유저 현금 합과 같다', () => {
    const result = runSimulation(buildScenario({ userCount: 5, days: 2 }))
    expect(result.flows.at(-1)!.moneySupply).toBe(finalSupply(result))
  })
})

describe('결정론', () => {
  it('같은 시나리오를 두 번 돌리면 결과가 동일하다', () => {
    const scenario = buildScenario({ userCount: 5, days: 3 })
    const a = runSimulation(scenario)
    const b = runSimulation(scenario)

    expect(finalSupply(a)).toBe(finalSupply(b))
    expect(totalMinted(a)).toBe(totalMinted(b))
    expect(a.daily.map((d) => d.moneySupply)).toEqual(b.daily.map((d) => d.moneySupply))
  })

  it('시드가 다르면 가격 궤적이 달라진다', () => {
    const a = runSimulation(buildScenario({ userCount: 1, days: 2, suffix: 'a' }))
    const b = runSimulation(buildScenario({ userCount: 1, days: 2, suffix: 'b' }))

    expect(a.scenario.seed).not.toBe(b.scenario.seed)
    expect(a.priceTrail.at(-1)!.prices).not.toEqual(b.priceTrail.at(-1)!.prices)
  })
})

describe('프로파일 비교', () => {
  it('접속이 잦을수록 총자산이 크다 (하드코어 > 캐주얼 > 방치)', () => {
    const assets = (kind: 'HARDCORE' | 'CASUAL' | 'IDLE'): bigint =>
      runSimulation(buildScenario({ userCount: 1, days: 7, profiles: [kind] })).daily.at(-1)!
        .totalAssets

    const hardcore = assets('HARDCORE')
    const casual = assets('CASUAL')
    const idle = assets('IDLE')

    expect(hardcore).toBeGreaterThan(casual)
    expect(casual).toBeGreaterThan(idle)
  })
})

describe('입력 검증', () => {
  it('유저 수·일수가 1 미만이면 RangeError', () => {
    expect(() => runSimulation(buildScenario({ userCount: 0, days: 1 }))).toThrow(RangeError)
    expect(() => runSimulation(buildScenario({ userCount: 1, days: 0 }))).toThrow(RangeError)
  })
})
