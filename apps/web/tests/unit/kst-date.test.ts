import { describe, test, expect } from 'vitest'
import { kstDayStart, kstWeekStart } from '@idle/game-core'
import { toKstIso, toKstDateString } from '../../src/lib/kst-date'

/**
 * KST 자정 경계로 저장된 UTC 순간을 KST 달력일로 올바르게 되돌리는지 검증한다.
 * 회귀 근거: #20 리뷰 HIGH — 그대로 UTC 슬라이스하면 하루 이르게 표시되던 버그.
 */
describe('toKstDateString / toKstIso', () => {
  test('KST 자정 경계(UTC 전날 15:00)를 KST 달력일로 보정한다', () => {
    // UTC 2026-07-21T15:00:00Z = KST 2026-07-22 00:00 → 표시는 07-22 여야 한다(07-21 아님).
    const stored = new Date('2026-07-21T15:00:00.000Z')
    expect(toKstDateString(stored)).toBe('2026-07-22')
    expect(toKstIso(stored)).toBe('2026-07-22T00:00:00.000Z')
  })

  test('순진한 UTC 슬라이스(버그)와 결과가 다르다', () => {
    const stored = new Date('2026-07-21T15:00:00.000Z')
    const naive = stored.toISOString().slice(0, 10) // 버그: '2026-07-21'
    expect(naive).toBe('2026-07-21')
    expect(toKstDateString(stored)).not.toBe(naive)
  })

  test('kstDayStart 왕복 — 임의 KST 시각의 달력일을 보존한다(월 경계 포함)', () => {
    // KST 2026-03-01 23:30 = UTC 2026-03-01T14:30:00Z
    const instant = new Date('2026-03-01T14:30:00.000Z')
    expect(toKstDateString(kstDayStart(instant))).toBe('2026-03-01')
  })

  test('kstWeekStart 왕복 — 주 시작일을 KST 달력일로 반환한다', () => {
    const instant = new Date('2026-07-22T03:00:00.000Z') // KST 2026-07-22 12:00
    // 주 시작(일요일 KST)이 KST 달력일로 슬라이스되어야 한다.
    expect(toKstDateString(kstWeekStart(instant))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // 주 시작은 해당 시각보다 이후일 수 없다.
    expect(kstWeekStart(instant).getTime()).toBeLessThanOrEqual(instant.getTime())
  })
})
