/**
 * 인플레 지표 산정식 테스트 (#21 결정 5).
 *
 * 산술평균을 기하평균으로 교체한 근거를 회귀로 고정한다. 실측 데이터에서
 * 주간 정산일 통화량이 −92.8% 빠지고 다음날 +1,145% 회복하는 진동이 있었고,
 * 산술평균은 그 진동을 흡수해 "인플레 51.29%/일" 이라는 거짓 신호를 냈다.
 * 같은 계열의 기하평균은 13.33%/일, 마지막 7일 수렴값은 3.49%/일이었다.
 */

import { describe, expect, it } from 'vitest'
import { buildScenario, checkSimulated, geometricInflation, runSimulation } from '../../src'

describe('geometricInflation', () => {
  it('일정 비율로 늘어나는 계열의 증가율을 정확히 낸다', () => {
    // 100 → 110 → 121: 매일 정확히 10%.
    const rate = geometricInflation([100n, 110n, 121n])
    expect(rate).toBeCloseTo(0.1, 10)
  })

  it('감소 계열은 음수로 낸다', () => {
    const rate = geometricInflation([100n, 90n, 81n])
    expect(rate).toBeCloseTo(-0.1, 10)
  })

  it('정산일 진동에 오염되지 않는다 — 산술평균과 갈리는 지점', () => {
    // 시작 100 → 끝 121 이므로 실제 증가율은 10%/일이다. 중간에 통화량이
    // 8 까지 빠졌다 회복해도 기하평균은 양 끝만 본다.
    const supply = [100n, 8n, 121n]
    const geo = geometricInflation(supply)!
    const arithmetic = (-0.92 + 14.125) / 2 // 같은 계열의 일간 증가율 산술평균

    expect(geo).toBeCloseTo(0.1, 10)
    expect(arithmetic).toBeGreaterThan(6) // 600%/일 — 거짓 신호
    expect(geo).toBeLessThan(arithmetic)
  })

  it('계열이 2개 미만이면 null', () => {
    expect(geometricInflation([])).toBeNull()
    expect(geometricInflation([100n])).toBeNull()
  })

  it('시작이나 끝이 0 이면 null — 기하평균을 정의할 수 없다', () => {
    expect(geometricInflation([0n, 100n])).toBeNull()
    expect(geometricInflation([100n, 0n])).toBeNull()
  })
})

describe('checkSimulated 인플레 보고', () => {
  const result = runSimulation(buildScenario({ userCount: 5, days: 14 }))
  const checks = checkSimulated(result)

  it('전 구간·후반·수렴값 3구간을 모두 낸다', () => {
    for (const id of ['sim-inflation-whole', 'sim-inflation-late', 'sim-inflation-converged']) {
      expect(
        checks.find((check) => check.id === id),
        id,
      ).toBeDefined()
    }
  })

  it('산술평균 기반 단일 지표는 더 이상 내지 않는다', () => {
    expect(checks.find((check) => check.id === 'sim-inflation')).toBeUndefined()
  })

  it('인플레·발행액 지표는 합격/불합격을 가르지 않는다 (참고 지표)', () => {
    const referenceIds = [
      'sim-revenue-per-tick',
      'sim-sink-ratio',
      'sim-inflation-whole',
      'sim-inflation-late',
      'sim-inflation-converged',
    ]
    for (const id of referenceIds) {
      expect(checks.find((check) => check.id === id)?.pass, id).toBe(true)
    }
  })

  it('발행액 지표에 등급 배수 때문에 앵커와 비교 불가라는 설명이 붙는다', () => {
    const check = checks.find((c) => c.id === 'sim-revenue-per-tick')
    expect(check?.target).toContain('참고 지표')
    expect(check?.note).toContain('등급')
  })
})
