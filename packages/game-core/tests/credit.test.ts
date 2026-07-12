import { describe, expect, it } from 'vitest'
import {
  ABSOLUTE_MAX_GRADE,
  applyCreditDelta,
  BASE_MAX_GRADE,
  CREDIT_DEFAULT,
  CREDIT_MAX,
  CREDIT_MIN,
  creditXpBonusBps,
  effectiveMaxGrade,
  EMERGENCY_CREDIT_THRESHOLD,
  EMERGENCY_SUPPORT_CAP,
  getCreditTier,
  INACTIVE_DAYS,
  REDISTRIBUTION_CREDIT_MIN,
  REDISTRIBUTION_VAULT_RATIO_BPS,
  redistributionWeight,
  UNPAID_DAILY_PENALTY,
  weeklyCreditDelta,
} from '../src/credit/credit'

describe('credit constants', () => {
  it('range and default match design 07 §신뢰도 시스템', () => {
    expect(CREDIT_MIN).toBe(0)
    expect(CREDIT_MAX).toBe(2000)
    expect(CREDIT_DEFAULT).toBe(1000)
  })

  it('grade bounds match decision 1', () => {
    expect(BASE_MAX_GRADE).toBe(8)
    expect(ABSOLUTE_MAX_GRADE).toBe(10)
  })

  it('penalty and redistribution/emergency constants', () => {
    expect(UNPAID_DAILY_PENALTY).toBe(-10)
    expect(EMERGENCY_SUPPORT_CAP).toBe(1_000_000n)
    expect(EMERGENCY_CREDIT_THRESHOLD).toBe(300)
    expect(INACTIVE_DAYS).toBe(30)
    expect(REDISTRIBUTION_CREDIT_MIN).toBe(300)
    expect(REDISTRIBUTION_VAULT_RATIO_BPS).toBe(7000)
  })
})

describe('getCreditTier', () => {
  it('RESTRICTED for 0..299', () => {
    expect(getCreditTier(0)).toBe('RESTRICTED')
    expect(getCreditTier(299)).toBe('RESTRICTED')
  })

  it('LIMITED for 300..699', () => {
    expect(getCreditTier(300)).toBe('LIMITED')
    expect(getCreditTier(699)).toBe('LIMITED')
  })

  it('NORMAL for 700..999', () => {
    expect(getCreditTier(700)).toBe('NORMAL')
    expect(getCreditTier(999)).toBe('NORMAL')
  })

  it('TRUSTED for 1000..1499', () => {
    expect(getCreditTier(1000)).toBe('TRUSTED')
    expect(getCreditTier(1499)).toBe('TRUSTED')
  })

  it('ELITE for 1500..2000', () => {
    expect(getCreditTier(1500)).toBe('ELITE')
    expect(getCreditTier(2000)).toBe('ELITE')
  })
})

describe('weeklyCreditDelta', () => {
  it('DAU 20 → 0 (maintain)', () => {
    expect(weeklyCreditDelta(20)).toBe(0)
  })

  it('DAU 40 → +10', () => {
    expect(weeklyCreditDelta(40)).toBe(10)
  })

  it('DAU 5 → -8 (floor(2.5) − 10)', () => {
    expect(weeklyCreditDelta(5)).toBe(-8)
  })

  it('DAU 0 → -10', () => {
    expect(weeklyCreditDelta(0)).toBe(-10)
  })
})

describe('applyCreditDelta', () => {
  it('adds delta within range', () => {
    expect(applyCreditDelta(1000, 10)).toBe(1010)
    expect(applyCreditDelta(1000, -8)).toBe(992)
  })

  it('clamps to CREDIT_MIN on underflow', () => {
    expect(applyCreditDelta(5, -10)).toBe(0)
    expect(applyCreditDelta(0, -1)).toBe(0)
  })

  it('clamps to CREDIT_MAX on overflow', () => {
    expect(applyCreditDelta(1995, 10)).toBe(2000)
    expect(applyCreditDelta(2000, 1)).toBe(2000)
  })

  it('exact boundary hits are preserved', () => {
    expect(applyCreditDelta(1990, 10)).toBe(2000)
    expect(applyCreditDelta(10, -10)).toBe(0)
  })
})

describe('effectiveMaxGrade', () => {
  it('base 8 below 1000', () => {
    expect(effectiveMaxGrade(0)).toBe(8)
    expect(effectiveMaxGrade(999)).toBe(8)
  })

  it('+1 → 9 at 1000..1499', () => {
    expect(effectiveMaxGrade(1000)).toBe(9)
    expect(effectiveMaxGrade(1499)).toBe(9)
  })

  it('+2 → 10 at 1500+', () => {
    expect(effectiveMaxGrade(1500)).toBe(10)
    expect(effectiveMaxGrade(2000)).toBe(10)
  })
})

describe('creditXpBonusBps', () => {
  it('0 below 1000', () => {
    expect(creditXpBonusBps(0)).toBe(0)
    expect(creditXpBonusBps(999)).toBe(0)
  })

  it('1000 bps (+10%) at 1000..1499', () => {
    expect(creditXpBonusBps(1000)).toBe(1000)
    expect(creditXpBonusBps(1499)).toBe(1000)
  })

  it('2000 bps (+20%) at 1500+', () => {
    expect(creditXpBonusBps(1500)).toBe(2000)
    expect(creditXpBonusBps(2000)).toBe(2000)
  })
})

describe('redistributionWeight', () => {
  it('vault 0 → weight equals weeklyDAU (ln(1) = 0)', () => {
    expect(redistributionWeight(0, 0n)).toBe(0)
    expect(redistributionWeight(20, 0n)).toBe(20)
  })

  it('adds natural log of (vault + 1)', () => {
    expect(redistributionWeight(0, 1n)).toBeCloseTo(Math.log(2))
    expect(redistributionWeight(10, 999n)).toBeCloseTo(10 + Math.log(1000))
  })
})
