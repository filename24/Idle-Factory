/**
 * `/debug` 수확 시계 조작 순수 헬퍼(`debugTickTemplates`) 유닛 테스트.
 *
 * Sapphire/DB/별칭 의존이 없어 목 없이 그대로 로드해 검증한다.
 * 대상: 프리셋·숫자 해석 autocomplete, tick→경과시간 포맷, lastHarvestAt 백데이트.
 */

import { describe, expect, it } from 'vitest'
import {
  MAX_ADVANCE_TICKS,
  TICKS_PER_DAY,
  TICKS_PER_HOUR,
  computeBackdatedHarvestAt,
  formatTickDuration,
  tickAutocompleteTemplates,
  tickPresetTemplates
} from '../../src/utils/debugTickTemplates'

describe('tick 상수 (TICK_MS 파생)', () => {
  it('1시간=6 tick, 1일=144 tick', () => {
    expect(TICKS_PER_HOUR).toBe(6)
    expect(TICKS_PER_DAY).toBe(144)
    expect(MAX_ADVANCE_TICKS).toBe(90 * 144)
  })
})

describe('tickPresetTemplates', () => {
  it('시간·일 프리셋을 tick 값과 함께 노출한다', () => {
    const presets = tickPresetTemplates()
    const byValue = Object.fromEntries(presets.map((p) => [p.value, p.name]))
    expect(byValue[6]).toContain('1시간 뒤')
    expect(byValue[144]).toContain('1일 뒤')
    expect(byValue[4320]).toContain('30일 뒤')
    // 모든 값이 상한 이내
    expect(presets.every((p) => p.value <= MAX_ADVANCE_TICKS)).toBe(true)
  })
})

describe('tickAutocompleteTemplates', () => {
  it('빈 입력은 고정 프리셋을 반환한다', () => {
    expect(tickAutocompleteTemplates('')).toEqual(tickPresetTemplates())
  })

  it('비정수 입력은 고정 프리셋으로 폴백한다', () => {
    expect(tickAutocompleteTemplates('abc')).toEqual(tickPresetTemplates())
  })

  it('양의 정수 N 은 [N시간 뒤, N일 뒤, N tick] 로 해석한다', () => {
    const out = tickAutocompleteTemplates('3')
    expect(out.map((o) => o.value)).toEqual([18, 432, 3]) // 3*6, 3*144, 3
    expect(out[0].name).toContain('3시간 뒤')
    expect(out[1].name).toContain('3일 뒤')
    expect(out[2].name).toContain('직접')
  })

  it('상한 초과 해석은 제외한다 (일/시간 환산이 상한을 넘으면)', () => {
    // 12960 tick = 상한. *6/*144 는 상한 초과 → raw(12960) 만 남는다.
    const out = tickAutocompleteTemplates(String(MAX_ADVANCE_TICKS))
    expect(out.map((o) => o.value)).toEqual([MAX_ADVANCE_TICKS])
  })

  it('모든 해석이 상한을 넘으면 프리셋으로 폴백한다', () => {
    const out = tickAutocompleteTemplates(String(MAX_ADVANCE_TICKS + 1))
    expect(out).toEqual(tickPresetTemplates())
  })

  it('0 이하는 프리셋으로 폴백한다', () => {
    expect(tickAutocompleteTemplates('0')).toEqual(tickPresetTemplates())
  })
})

describe('formatTickDuration', () => {
  it.each([
    [6, '1시간'],
    [144, '1일'],
    [432, '3일'],
    [4320, '30일'],
    [7, '1시간 10분'],
    [0, '0분']
  ])('%i tick → "%s"', (ticks, expected) => {
    expect(formatTickDuration(ticks)).toBe(expected)
  })
})

describe('computeBackdatedHarvestAt', () => {
  it('now 에서 tick×10분 만큼 과거 시각을 만든다', () => {
    const now = new Date('2020-01-01T12:00:00.000Z')
    // 6 tick = 60분 전
    expect(computeBackdatedHarvestAt(now, 6).toISOString()).toBe(
      '2020-01-01T11:00:00.000Z'
    )
    // 144 tick = 1일 전
    expect(computeBackdatedHarvestAt(now, 144).toISOString()).toBe(
      '2019-12-31T12:00:00.000Z'
    )
  })
})
