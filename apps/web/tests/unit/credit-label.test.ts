import { describe, test, expect } from 'vitest'
import type { CreditTier } from '@idle/game-core'
import { creditTierLabel, creditTierColorClass } from '../../src/lib/credit-label'

describe('creditTierLabel', () => {
  test('모든 구간에 한국어 라벨을 매핑한다', () => {
    const cases: Record<CreditTier, string> = {
      RESTRICTED: '제한',
      LIMITED: '주의',
      NORMAL: '정상',
      TRUSTED: '신뢰',
      ELITE: '엘리트',
    }
    for (const [tier, label] of Object.entries(cases)) {
      expect(creditTierLabel(tier as CreditTier)).toBe(label)
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
