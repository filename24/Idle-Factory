/**
 * 글로벌 신뢰도 시스템 통합 테스트 (전용 *-dev DB).
 *
 * 검증 축 (이슈 #17, docs/design/07-global-system.md):
 *  - applyWeeklyCredit: 주간 증감(floor(DAU×0.5)−10) · 0~2000 clamp · 긴급 지원금
 *  - applyUnpaidPenalty: 최근 정산 주 미납 귀속 서버 −10 (라인 단위 판정)
 *  - collectInactive: 30일 경과 서버 금고 동결 · 재수집 가드 · vault>0 필터
 *  - runMonthlyRedistribution: 가중 분배 · 70/30 · 나머지 · eligible 필터 · 화폐 보존
 *  - restoreInactivePool: 복귀 시 미분배 금고 복원 · 분배 완료분 복원 없음
 */

import { container } from '@sapphire/framework'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { GuildService } from '../../src/services/guild'
import {
  applyUnpaidPenalty,
  collectInactive
} from '../../src/scheduled-tasks/daily-global'
import { runMonthlyRedistribution } from '../../src/scheduled-tasks/monthly-redistribution'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

beforeEach(async () => {
  // runMonthlyRedistribution 은 진행/미지급 실패를 container.logger 로 남기는데,
  // 클라이언트 없이는 미설정이므로 스텁 주입 (weekly-settlement.test 관례 준수).
  container.logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  } as unknown as typeof container.logger
  await resetDb()
})
afterAll(async () => {
  await closeDb()
})

/** 재분배/활성 판정 기준 시각. */
const NOW = new Date('2026-07-15T00:00:00Z')
/** 최근 7일 윈도 내부(활성 유저) 활동 시각. */
const RECENT = new Date('2026-07-10T00:00:00Z')

async function seedGuild(input: {
  id: string
  credit?: number
  vault?: bigint
  weeklyDAU?: number
  leftAt?: Date | null
}) {
  await testPrisma.guild.create({
    data: {
      id: input.id,
      name: `guild-${input.id}`,
      credit: input.credit ?? 1000,
      vault: input.vault ?? 0n,
      weeklyDAU: input.weeklyDAU ?? 0,
      leftAt: input.leftAt ?? null
    }
  })
}

async function seedUser(id: string, money: bigint) {
  await UserService.ensure(testPrisma, { discordId: id })
  await testPrisma.user.update({ where: { id }, data: { money } })
}

async function seedActivity(guildId: string, userId: string, date = RECENT) {
  await testPrisma.guildDailyActivity.create({
    data: { guildId, userId, date }
  })
}

async function creditOf(id: string) {
  const g = await testPrisma.guild.findUniqueOrThrow({ where: { id } })
  return g.credit
}
async function vaultOf(id: string) {
  const g = await testPrisma.guild.findUniqueOrThrow({ where: { id } })
  return g.vault
}
async function moneyOf(id: string) {
  const u = await testPrisma.user.findUniqueOrThrow({ where: { id } })
  return u.money
}

describe('GuildService.applyWeeklyCredit', () => {
  it('DAU 로 신뢰도가 증가/감소하고 활성 서버만 갱신한다', async () => {
    await seedGuild({ id: 'g-up', credit: 1000, weeklyDAU: 40 }) // +20−10 = +10
    await seedGuild({ id: 'g-down', credit: 1000, weeklyDAU: 0 }) // −10
    await seedGuild({ id: 'g-left', credit: 1000, weeklyDAU: 100, leftAt: NOW })

    const result = await GuildService.applyWeeklyCredit(testPrisma)

    expect(await creditOf('g-up')).toBe(1010)
    expect(await creditOf('g-down')).toBe(990)
    expect(await creditOf('g-left')).toBe(1000) // 비활성 서버는 미갱신
    expect(result.updatedGuilds).toBe(2)
    expect(result.emergencySupportedGuildIds).toEqual([])
  })

  it('신뢰도는 0~2000 으로 clamp 된다', async () => {
    await seedGuild({ id: 'g-min', credit: 5, weeklyDAU: 0 }) // 5−10 → 0
    await seedGuild({ id: 'g-max', credit: 1998, weeklyDAU: 100 }) // +50−10 → 2000 cap

    await GuildService.applyWeeklyCredit(testPrisma)

    expect(await creditOf('g-min')).toBe(0)
    expect(await creditOf('g-max')).toBe(2000)
  })

  it('적용 후 신뢰도<300 & 금고<100만원이면 긴급 지원금으로 100만원 보전한다', async () => {
    await seedGuild({ id: 'g-poor', credit: 305, vault: 500n, weeklyDAU: 0 }) // 305−10=295 <300
    await seedGuild({
      id: 'g-rich',
      credit: 305,
      vault: 2_000_000n,
      weeklyDAU: 0
    }) // 금고 충분 → 미발동

    const result = await GuildService.applyWeeklyCredit(testPrisma)

    expect(await creditOf('g-poor')).toBe(295)
    expect(await vaultOf('g-poor')).toBe(1_000_000n)
    expect(await vaultOf('g-rich')).toBe(2_000_000n) // 그대로
    expect(result.emergencySupportedGuildIds).toEqual(['g-poor'])
  })
})

describe('applyUnpaidPenalty', () => {
  async function seedSettlement(input: {
    userId: string
    weekStart: Date
    lines: ReadonlyArray<{ guildId: string; taxDue: bigint; taxPaid: bigint }>
  }) {
    await testPrisma.weeklySettlement.create({
      data: {
        userId: input.userId,
        weekStart: input.weekStart,
        lines: {
          create: input.lines.map((l) => ({
            guildId: l.guildId,
            weekStart: input.weekStart,
            salesRevenue: 0n,
            taxDue: l.taxDue,
            taxPaid: l.taxPaid,
            appliedBps: 500
          }))
        }
      }
    })
  }

  it('최근 정산 주에 미납(taxDue>taxPaid) 귀속 서버만 −10 을 받는다', async () => {
    await seedGuild({ id: 'g-unpaid', credit: 1000 })
    await seedGuild({ id: 'g-paid', credit: 1000 })
    await seedUser('u-1', 0n)
    await seedSettlement({
      userId: 'u-1',
      weekStart: new Date('2026-07-05T15:00:00Z'),
      lines: [
        { guildId: 'g-unpaid', taxDue: 100n, taxPaid: 40n },
        { guildId: 'g-paid', taxDue: 100n, taxPaid: 100n }
      ]
    })

    const penalized = await applyUnpaidPenalty(testPrisma)

    expect(penalized.length).toBe(1)
    expect(await creditOf('g-unpaid')).toBe(990)
    expect(await creditOf('g-paid')).toBe(1000)
  })

  it('가장 최근 정산 주만 판정한다 (이전 주 미납은 무시)', async () => {
    await seedGuild({ id: 'g-x', credit: 1000 })
    await seedUser('u-1', 0n)
    await seedUser('u-2', 0n)
    // 이전 주: 미납. 최근 주: 완납 → 패널티 없음.
    await seedSettlement({
      userId: 'u-1',
      weekStart: new Date('2026-06-28T15:00:00Z'),
      lines: [{ guildId: 'g-x', taxDue: 100n, taxPaid: 0n }]
    })
    await seedSettlement({
      userId: 'u-2',
      weekStart: new Date('2026-07-05T15:00:00Z'),
      lines: [{ guildId: 'g-x', taxDue: 100n, taxPaid: 100n }]
    })

    const penalized = await applyUnpaidPenalty(testPrisma)

    expect(penalized.length).toBe(0)
    expect(await creditOf('g-x')).toBe(1000)
  })

  it('신뢰도는 0 미만으로 내려가지 않는다', async () => {
    await seedGuild({ id: 'g-zero', credit: 5 })
    await seedUser('u-1', 0n)
    await seedSettlement({
      userId: 'u-1',
      weekStart: new Date('2026-07-05T15:00:00Z'),
      lines: [{ guildId: 'g-zero', taxDue: 100n, taxPaid: 0n }]
    })

    await applyUnpaidPenalty(testPrisma)

    expect(await creditOf('g-zero')).toBe(0)
  })
})

describe('collectInactive', () => {
  const LEFT_31D = new Date('2026-06-14T00:00:00Z') // NOW-31일
  const LEFT_10D = new Date('2026-07-05T00:00:00Z') // NOW-10일

  it('30일 경과 & 금고>0 서버를 동결하고 vault 를 0 으로 만든다', async () => {
    await seedGuild({ id: 'g-old', vault: 5000n, leftAt: LEFT_31D })

    const { collectedGuilds, frozenTotal } = await collectInactive(
      testPrisma,
      NOW
    )

    expect(collectedGuilds).toBe(1)
    expect(frozenTotal).toBe(5000n)
    expect(await vaultOf('g-old')).toBe(0n)
    const pool = await testPrisma.inactiveServerPool.findUniqueOrThrow({
      where: { guildId: 'g-old' }
    })
    expect(pool.frozenAmount).toBe(5000n)
    expect(pool.distributedAt).toBeNull()
    expect(pool.exitedAt.getTime()).toBe(LEFT_31D.getTime())
  })

  it('30일 미경과·금고 0·활성 서버는 수집하지 않는다', async () => {
    await seedGuild({ id: 'g-recent', vault: 5000n, leftAt: LEFT_10D })
    await seedGuild({ id: 'g-empty', vault: 0n, leftAt: LEFT_31D })
    await seedGuild({ id: 'g-active', vault: 5000n, leftAt: null })

    const { collectedGuilds } = await collectInactive(testPrisma, NOW)

    expect(collectedGuilds).toBe(0)
    expect(await testPrisma.inactiveServerPool.count()).toBe(0)
  })

  it('미분배 풀이 이미 있으면 재수집하지 않는다 (동결액 소실 방지)', async () => {
    await seedGuild({ id: 'g-dup', vault: 999n, leftAt: LEFT_31D })
    await testPrisma.inactiveServerPool.create({
      data: { guildId: 'g-dup', frozenAmount: 5000n, exitedAt: LEFT_31D }
    })

    const { collectedGuilds } = await collectInactive(testPrisma, NOW)

    expect(collectedGuilds).toBe(0)
    const pool = await testPrisma.inactiveServerPool.findUniqueOrThrow({
      where: { guildId: 'g-dup' }
    })
    expect(pool.frozenAmount).toBe(5000n) // 덮어쓰지 않음
    expect(await vaultOf('g-dup')).toBe(999n)
  })
})

describe('runMonthlyRedistribution', () => {
  async function seedPool(guildId: string, frozen: bigint) {
    // 풀은 이미 떠난 서버에 귀속되나, 재분배는 활성 서버로만 나간다.
    await seedGuild({
      id: guildId,
      vault: 0n,
      leftAt: new Date('2026-05-01T00:00:00Z')
    })
    await testPrisma.inactiveServerPool.create({
      data: {
        guildId,
        frozenAmount: frozen,
        exitedAt: new Date('2026-05-01T00:00:00Z')
      }
    })
  }

  it('가중치 비례로 분배하고 70/30 을 금고/유저로 나눈다', async () => {
    await seedPool('g-pool', 1000n) // totalPool = 1000
    // 유일 수혜 서버(weeklyDAU 10, vault 0 → weight 10). 활성 유저 2명.
    await seedGuild({ id: 'gA', credit: 1000, weeklyDAU: 10, vault: 0n })
    await seedUser('uA1', 0n)
    await seedUser('uA2', 0n)
    await seedActivity('gA', 'uA1')
    await seedActivity('gA', 'uA2')

    const result = await runMonthlyRedistribution(testPrisma, NOW)

    // share=1000, 금고 70%=700, 유저 30%=300 → 2명 균등 150.
    expect(result.totalPool).toBe(1000n)
    expect(result.guildShares).toBe(1)
    expect(result.userPayouts).toBe(2)
    expect(result.failedGuildIds).toEqual([])
    expect(result.distributedPools).toBe(1)
    expect(await vaultOf('gA')).toBe(700n)
    expect(await moneyOf('uA1')).toBe(150n)
    expect(await moneyOf('uA2')).toBe(150n)
    // 풀 분배 완료 표시.
    const pool = await testPrisma.inactiveServerPool.findUniqueOrThrow({
      where: { guildId: 'g-pool' }
    })
    expect(pool.distributedAt).not.toBeNull()
  })

  it('활성 유저가 없으면 100% 금고로 간다', async () => {
    await seedPool('g-pool', 1000n)
    await seedGuild({ id: 'gA', credit: 1000, weeklyDAU: 10, vault: 0n })

    const result = await runMonthlyRedistribution(testPrisma, NOW)

    expect(result.userPayouts).toBe(0)
    expect(await vaultOf('gA')).toBe(1000n) // 700 + 300(유저 몫) 전액 금고
  })

  it('정수 나눗셈 나머지는 최대 가중치 서버 금고로 흡수되고 총액이 보존된다', async () => {
    await seedPool('g-pool', 10n) // totalPool = 10
    // 가중치 1 / 2 (weeklyDAU, vault 0). 활성 유저 없음 → 전액 금고.
    await seedGuild({ id: 'g1', credit: 1000, weeklyDAU: 1, vault: 0n })
    await seedGuild({ id: 'g2', credit: 1000, weeklyDAU: 2, vault: 0n })

    const result = await runMonthlyRedistribution(testPrisma, NOW)

    // share: g1=floor(10*1/3)=3, g2=floor(10*2/3)=6, 나머지 1 → 최대 가중치 g2.
    // 활성 유저 0 → 전액 금고: g1=3, g2=6+1=7.
    expect(result.totalPool).toBe(10n)
    const total = (await vaultOf('g1')) + (await vaultOf('g2'))
    expect(total).toBe(10n) // 화폐 보존
    expect(await vaultOf('g2')).toBe(7n)
    expect(await vaultOf('g1')).toBe(3n)
  })

  it('leftAt != null 또는 신뢰도<300 서버는 수혜 대상에서 제외된다', async () => {
    await seedPool('g-pool', 1000n)
    await seedGuild({ id: 'g-ok', credit: 1000, weeklyDAU: 5, vault: 0n })
    await seedGuild({ id: 'g-low', credit: 200, weeklyDAU: 5, vault: 0n })
    await seedGuild({
      id: 'g-gone',
      credit: 1000,
      weeklyDAU: 5,
      leftAt: NOW
    })

    const result = await runMonthlyRedistribution(testPrisma, NOW)

    expect(result.guildShares).toBe(1) // g-ok 만
    expect(await vaultOf('g-ok')).toBe(1000n)
    expect(await vaultOf('g-low')).toBe(0n)
    expect(await vaultOf('g-gone')).toBe(0n)
  })

  it('선클레임 구조: 재실행해도 이미 분배된 풀은 이중 지급하지 않는다', async () => {
    await seedPool('g-pool', 1000n)
    await seedGuild({ id: 'gA', credit: 1000, weeklyDAU: 10, vault: 0n })

    const first = await runMonthlyRedistribution(testPrisma, NOW)
    expect(first.guildShares).toBe(1)
    expect(await vaultOf('gA')).toBe(1000n)

    // 두 번째 실행: 미분배 풀 없음 → 아무것도 분배하지 않는다.
    const second = await runMonthlyRedistribution(testPrisma, NOW)
    expect(second.totalPool).toBe(0n)
    expect(second.distributedPools).toBe(0)
    expect(second.guildShares).toBe(0)
    expect(await vaultOf('gA')).toBe(1000n) // 증액 없음
  })

  it('수혜 자격 서버가 없으면 풀을 보존한다(분배 표시 안 함)', async () => {
    await seedPool('g-pool', 1000n)
    // 활성 & credit>=300 서버 없음.

    const result = await runMonthlyRedistribution(testPrisma, NOW)

    expect(result.distributedPools).toBe(0)
    const pool = await testPrisma.inactiveServerPool.findUniqueOrThrow({
      where: { guildId: 'g-pool' }
    })
    expect(pool.distributedAt).toBeNull()
  })
})

describe('GuildService.restoreInactivePool', () => {
  it('미분배 풀 복원: 금고 += frozenAmount 후 풀 행 삭제', async () => {
    await seedGuild({ id: 'g-back', vault: 1000n, leftAt: null })
    await testPrisma.inactiveServerPool.create({
      data: {
        guildId: 'g-back',
        frozenAmount: 5000n,
        exitedAt: new Date('2026-06-01T00:00:00Z')
      }
    })

    const restored = await GuildService.restoreInactivePool(
      testPrisma,
      'g-back'
    )

    expect(restored).toBe(5000n)
    expect(await vaultOf('g-back')).toBe(6000n)
    expect(
      await testPrisma.inactiveServerPool.findUnique({
        where: { guildId: 'g-back' }
      })
    ).toBeNull()
  })

  it('이미 분배된 풀(distributedAt != null)은 복원하지 않는다', async () => {
    await seedGuild({ id: 'g-dist', vault: 1000n })
    await testPrisma.inactiveServerPool.create({
      data: {
        guildId: 'g-dist',
        frozenAmount: 5000n,
        exitedAt: new Date('2026-06-01T00:00:00Z'),
        distributedAt: new Date('2026-07-01T00:00:00Z')
      }
    })

    const restored = await GuildService.restoreInactivePool(
      testPrisma,
      'g-dist'
    )

    expect(restored).toBe(0n)
    expect(await vaultOf('g-dist')).toBe(1000n) // 그대로
  })

  it('upsertOnJoin 재초대 시 미분배 금고를 복원한다', async () => {
    await seedGuild({
      id: 'g-rejoin',
      vault: 200n,
      leftAt: new Date('2026-06-01T00:00:00Z')
    })
    await testPrisma.inactiveServerPool.create({
      data: {
        guildId: 'g-rejoin',
        frozenAmount: 800n,
        exitedAt: new Date('2026-06-01T00:00:00Z')
      }
    })

    await GuildService.upsertOnJoin(testPrisma, {
      guildId: 'g-rejoin',
      name: 'g-rejoin'
    })

    expect(await vaultOf('g-rejoin')).toBe(1000n)
    expect(
      await testPrisma.inactiveServerPool.findUnique({
        where: { guildId: 'g-rejoin' }
      })
    ).toBeNull()
  })
})
