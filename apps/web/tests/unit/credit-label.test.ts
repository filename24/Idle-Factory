import { describe, test, expect } from 'vitest'
import type { CreditTier } from '@idle/game-core'
import ko from '../../messages/ko.json'
import en from '../../messages/en.json'
import { creditTierColorClass } from '../../src/lib/credit-label'

// 구간 라벨은 messages/<locale>.json 의 `credit.tier.<TIER>` 로 옮겼다.
// 여기서는 "모든 구간에 라벨이 존재하는가"만 지킨다 — 하나라도 빠지면
// 화면에 키 문자열이 그대로 노출된다.
describe('credit.tier 메시지 키', () => {
  const TIERS: CreditTier[] = ['RESTRICTED', 'LIMITED', 'NORMAL', 'TRUSTED', 'ELITE']

  test('ko/en 카탈로그가 모든 구간 라벨을 갖는다', () => {
    for (const tier of TIERS) {
      expect(ko.credit.tier[tier]).toBeTruthy()
      expect(en.credit.tier[tier]).toBeTruthy()
    }
  })
})

describe('creditTierColorClass', () => {
  test('낮은 구간은 경고색, 높은 구간은 성공/강조색', () => {
    expect(creditTierColorClass('RESTRICTED')).toBe('text-accent-red')
    expect(creditTierColorClass('LIMITED')).toBe('text-accent-orange')
    expect(creditTierColorClass('NORMAL')).toBe('text-body')
    expect(creditTierColorClass('TRUSTED')).toBe('text-accent-green')
    expect(creditTierColorClass('ELITE')).toBe('text-accent-blue')
  })
})
