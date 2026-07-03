/**
 * 마켓 사기 방지 순수 헬퍼 유닛 테스트.
 *
 * DB/Prisma 의존 없음 — 반복 상대 XP 감쇠 승수·1만분율 정수 곱·신규 계정 시그널의
 * 경계값을 검증한다. 수치 근거: docs/design/09-level-xp.md §사기 방지,
 * docs/design/10-open-questions.md "사기 방지 규칙 세부 수치" v0.
 */

import { describe, expect, it } from 'vitest'

import {
  applyPpm,
  assessActorTrust,
  marketSellXpMultiplierPpm,
  NEW_ACCOUNT_MAX_AGE_DAYS,
  NEW_GUILD_MEMBER_MAX_AGE_DAYS
} from '../../src/services/tradeLog'

const DAY_MS = 24 * 60 * 60 * 1000

describe('marketSellXpMultiplierPpm', () => {
  it('grants 100% for the 1st..3rd sale', () => {
    expect(marketSellXpMultiplierPpm(1)).toBe(10_000)
    expect(marketSellXpMultiplierPpm(2)).toBe(10_000)
    expect(marketSellXpMultiplierPpm(3)).toBe(10_000)
  })

  it('grants 50% for the 4th..5th sale', () => {
    expect(marketSellXpMultiplierPpm(4)).toBe(5_000)
    expect(marketSellXpMultiplierPpm(5)).toBe(5_000)
  })

  it('grants 0% from the 6th sale onward', () => {
    expect(marketSellXpMultiplierPpm(6)).toBe(0)
    expect(marketSellXpMultiplierPpm(7)).toBe(0)
    expect(marketSellXpMultiplierPpm(100)).toBe(0)
  })
})

describe('applyPpm', () => {
  it('multiplies a BigInt base by a permyriad factor with floor', () => {
    // 기본 MARKET_SELL XP = 20.
    expect(applyPpm(20n, 10_000)).toBe(20n) // 100%
    expect(applyPpm(20n, 5_000)).toBe(10n) // 50%
    expect(applyPpm(20n, 0)).toBe(0n) // 0%
  })

  it('floors fractional results (integer BigInt math, no float error)', () => {
    // 25 × 50% = 12.5 → floor 12
    expect(applyPpm(25n, 5_000)).toBe(12n)
    // 3 × 50% = 1.5 → floor 1
    expect(applyPpm(3n, 5_000)).toBe(1n)
  })

  it('handles large BigInt bases without precision loss', () => {
    const huge = 1_000_000_000_000_000_000n
    expect(applyPpm(huge, 5_000)).toBe(huge / 2n)
  })
})

describe('assessActorTrust', () => {
  const at = new Date('2026-07-03T00:00:00.000Z')

  it('flags a brand-new account (< 7 days) as new', () => {
    const signal = assessActorTrust({
      accountCreatedAt: new Date(at.getTime() - 2 * DAY_MS),
      guildJoinedAt: null,
      at
    })
    expect(signal.accountAgeDays).toBe(2)
    expect(signal.isNewAccount).toBe(true)
  })

  it('does not flag an account at/above the age threshold', () => {
    const signal = assessActorTrust({
      accountCreatedAt: new Date(
        at.getTime() - NEW_ACCOUNT_MAX_AGE_DAYS * DAY_MS
      ),
      guildJoinedAt: null,
      at
    })
    expect(signal.accountAgeDays).toBe(NEW_ACCOUNT_MAX_AGE_DAYS)
    expect(signal.isNewAccount).toBe(false)
  })

  it('flags a brand-new guild member (< 1 day) and yields age', () => {
    const signal = assessActorTrust({
      accountCreatedAt: new Date(at.getTime() - 30 * DAY_MS),
      guildJoinedAt: new Date(at.getTime() - 3 * 60 * 60 * 1000), // 3h ago
      at
    })
    expect(signal.isNewAccount).toBe(false)
    expect(signal.guildMemberAgeDays).toBe(0)
    expect(signal.isNewGuildMember).toBe(true)
  })

  it('never flags a new guild member when joinedAt is unknown (null)', () => {
    const signal = assessActorTrust({
      accountCreatedAt: new Date(at.getTime() - 30 * DAY_MS),
      guildJoinedAt: null,
      at
    })
    expect(signal.guildMemberAgeDays).toBeNull()
    expect(signal.isNewGuildMember).toBe(false)
    expect(NEW_GUILD_MEMBER_MAX_AGE_DAYS).toBe(1)
  })

  it('clamps negative ages (future timestamps) to 0', () => {
    const signal = assessActorTrust({
      accountCreatedAt: new Date(at.getTime() + DAY_MS), // 미래
      guildJoinedAt: new Date(at.getTime() + DAY_MS),
      at
    })
    expect(signal.accountAgeDays).toBe(0)
    expect(signal.guildMemberAgeDays).toBe(0)
  })
})
