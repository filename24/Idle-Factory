/**
 * `WeeklySettlementService` 통합 테스트 (전용 idle_i16-dev DB).
 *
 * 검증 축 (GitHub #16, docs/design/07-global-system.md):
 *  - 멱등성: 2회 실행 → 1회만 처리 ((userId, weekStart) unique 앵커)
 *  - 서버별 분리 과세(D-1): 서버 가산세 차등 반영 + 금고 분리 적립
 *  - 자산 누진 구간(U-2: 현금+창고×시세+공장 투자비) · cap 40%
 *  - 미납 가드: 부분 차감 + unpaidAmount 기록 + 결정적 그리디 배분
 *  - guildId=null 판매분: 기본 세율 과세, 금고 적립 없음
 *  - 집계 필터: price=0 회수·DIRECT_BUY·윈도 밖 거래 제외
 *  - weeklyDAU 갱신(활동 없는 서버 0 리셋) + 활동 로그 2주 보존 정리
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { MaterialType, TradeKind } from '@idle/database'
import { factoryInvestment } from '@idle/game-core'
import { GuildActivityService } from '../../src/services/guildActivity'
import { WeeklySettlementService } from '../../src/services/weeklySettlement'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

/** 정산 잡 실행 시각 — 2026-07-05(일) 00:00 KST = 07-04T15:00Z. */
const NOW = new Date('2026-07-04T15:00:00Z')
/** 정산 윈도 시작 — 직전 일요일 00:00 KST. */
const WEEK_START = new Date('2026-06-27T15:00:00Z')
/** 윈도 내부의 거래 시각. */
const IN_WINDOW = new Date('2026-07-01T00:00:00Z')
/** 윈도 이전(전전 주)의 거래 시각. */
const BEFORE_WINDOW = new Date('2026-06-20T00:00:00Z')

async function seedUser(id: string, money: bigint) {
  await UserService.ensure(testPrisma, { discordId: id })
  await testPrisma.user.update({ where: { id }, data: { money } })
}

async function seedGuild(id: string, taxSurcharge = 0, weeklyDAU = 0) {
  await testPrisma.guild.create({
    data: { id, name: `guild-${id}`, taxSurcharge, weeklyDAU }
  })
}

async function seedSale(input: {
  from: string
  guildId: string | null
  price: bigint
  at?: Date
  kind?: TradeKind
  material?: MaterialType
}) {
  await testPrisma.tradeLog.create({
    data: {
      fromUserId: input.from,
      toUserId: null,
      guildId: input.guildId,
      kind: input.kind ?? 'MARKET_SELL',
      material: input.material ?? 'GRAIN',
      amount: 1n,
      price: input.price,
      createdAt: input.at ?? IN_WINDOW
    }
  })
}

async function guildVault(id: string) {
  const guild = await testPrisma.guild.findUniqueOrThrow({ where: { id } })
  return guild.vault
}

describe('WeeklySettlementService.settleWeek', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('기본 과세: 5% 구간 유저의 세액이 금고로 적립되고 헤더·라인이 기록된다', async () => {
    await seedUser('u-a', 500_000n) // 자산 < 100만 → 5%
    await seedGuild('g-1', 0)
    await seedSale({ from: 'u-a', guildId: 'g-1', price: 10_000n })

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })

    expect(result.weekStart.toISOString()).toBe(WEEK_START.toISOString())
    expect(result.settledUsers).toBe(1)
    expect(result.skippedUsers).toBe(0)
    expect(result.totalTaxPaid).toBe(500n)
    expect(result.totalVaultDeposited).toBe(500n)
    expect(result.totalUnpaid).toBe(0n)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-a' }
    })
    expect(user.money).toBe(499_500n)
    expect(await guildVault('g-1')).toBe(500n)

    const header = await testPrisma.weeklySettlement.findUniqueOrThrow({
      where: { userId_weekStart: { userId: 'u-a', weekStart: WEEK_START } },
      include: { lines: true }
    })
    expect(header.salesRevenue).toBe(10_000n)
    expect(header.taxDue).toBe(500n)
    expect(header.taxPaid).toBe(500n)
    expect(header.unpaidAmount).toBe(0n)
    expect(header.totalAssets).toBe(500_000n)
    expect(header.baseTaxBps).toBe(500)
    expect(header.guildId).toBeNull() // deprecated 헤더 컬럼 — 신규 행은 항상 null
    expect(header.lines).toHaveLength(1)
    expect(header.lines[0]).toMatchObject({
      guildId: 'g-1',
      salesRevenue: 10_000n,
      taxDue: 500n,
      taxPaid: 500n,
      appliedBps: 500
    })
  })

  it('멱등성: 같은 주를 2회 실행해도 1회만 처리된다', async () => {
    await seedUser('u-i', 500_000n)
    await seedGuild('g-i', 0)
    await seedSale({ from: 'u-i', guildId: 'g-i', price: 10_000n })

    const first = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    const second = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })

    expect(first.settledUsers).toBe(1)
    expect(second.settledUsers).toBe(0)
    expect(second.skippedUsers).toBe(1)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-i' }
    })
    expect(user.money).toBe(499_500n) // 중복 차감 없음
    expect(await guildVault('g-i')).toBe(500n) // 중복 적립 없음
    expect(await testPrisma.weeklySettlement.count()).toBe(1)
    expect(await testPrisma.weeklySettlementLine.count()).toBe(1)
  })

  it('서버별 분리 과세(D-1): 가산세가 서버마다 달리 적용되고 금고도 분리 적립된다', async () => {
    await seedUser('u-b', 500_000n) // 기본 5%
    await seedGuild('g-a', 0) // 가산 0 → 5%
    await seedGuild('g-b', 0.1) // 가산 +10%p → 15%
    await seedSale({ from: 'u-b', guildId: 'g-a', price: 10_000n })
    await seedSale({ from: 'u-b', guildId: 'g-b', price: 10_000n })

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    expect(result.settledUsers).toBe(1)
    expect(result.totalTaxPaid).toBe(500n + 1_500n)

    expect(await guildVault('g-a')).toBe(500n)
    expect(await guildVault('g-b')).toBe(1_500n)

    const lines = await testPrisma.weeklySettlementLine.findMany({
      orderBy: { guildId: 'asc' }
    })
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ guildId: 'g-a', appliedBps: 500 })
    expect(lines[1]).toMatchObject({ guildId: 'g-b', appliedBps: 1_500 })
  })

  it('누진 최고 구간(1억+) + 최대 가산세 → cap 40% 로 과세된다', async () => {
    await seedUser('u-rich', 100_000_000n) // 정확히 1억 → 20% 구간 ("1억 이상")
    await seedGuild('g-max', 0.2) // +20%p → 합 40% (cap 경계)
    await seedSale({ from: 'u-rich', guildId: 'g-max', price: 10_000n })

    await WeeklySettlementService.settleWeek(testPrisma, { now: NOW })

    const header = await testPrisma.weeklySettlement.findFirstOrThrow({
      include: { lines: true }
    })
    expect(header.baseTaxBps).toBe(2_000)
    expect(header.lines[0]!.appliedBps).toBe(4_000)
    expect(header.taxDue).toBe(4_000n) // 10,000 × 40%
    expect(await guildVault('g-max')).toBe(4_000n)
  })

  it('총자산 평가(U-2)에 창고 평가액·공장 투자비가 포함돼 누진 구간이 올라간다', async () => {
    await seedUser('u-asset', 900_000n)
    await seedGuild('g-asset', 0)
    await testPrisma.globalMarketPrice.create({
      data: { material: 'GRAIN', basePrice: 10n, currentPrice: 10n }
    })
    // 창고 20,000개 × 10원 = 200,000 → 현금 900,000 과 합쳐 100만 구간 돌파.
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-asset' }
    })
    await testPrisma.warehouseStack.create({
      data: { warehouseId: wh.id, material: 'GRAIN', count: 20_000n }
    })
    // 공장 투자비(FARM 2등급) — U-2 의 세 번째 항.
    const land = await testPrisma.land.findFirstOrThrow({
      where: { userId: 'u-asset' }
    })
    await testPrisma.factory.create({
      data: {
        userId: 'u-asset',
        landId: land.id,
        type: 'FARM',
        tier: 'T1',
        grade: 2,
        anchorX: 0,
        anchorY: 0
      }
    })
    await seedSale({ from: 'u-asset', guildId: 'g-asset', price: 10_000n })

    await WeeklySettlementService.settleWeek(testPrisma, { now: NOW })

    const header = await testPrisma.weeklySettlement.findFirstOrThrow()
    const expectedAssets = 900_000n + 200_000n + factoryInvestment('FARM', 2)
    expect(header.totalAssets).toBe(expectedAssets)
    expect(header.baseTaxBps).toBe(1_000) // 100만 ~ 1,000만 구간 → 10%
    expect(header.taxDue).toBe(1_000n)
  })

  it('미납 가드: 현금 한도까지만 차감하고 잔액을 기록한다 (그리디 배분 순서)', async () => {
    await seedUser('u-broke', 600n) // 세액(1,000)보다 적은 현금
    await seedGuild('g-pay1', 0)
    await seedGuild('g-pay2', 0)
    await seedSale({ from: 'u-broke', guildId: 'g-pay1', price: 10_000n }) // 세액 500
    await seedSale({ from: 'u-broke', guildId: 'g-pay2', price: 10_000n }) // 세액 500

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    expect(result.totalTaxPaid).toBe(600n)
    expect(result.totalUnpaid).toBe(400n)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-broke' }
    })
    expect(user.money).toBe(0n)

    // guildId 오름차순 그리디 — g-pay1 이 전액(500), g-pay2 는 잔여(100).
    expect(await guildVault('g-pay1')).toBe(500n)
    expect(await guildVault('g-pay2')).toBe(100n)

    const header = await testPrisma.weeklySettlement.findFirstOrThrow({
      include: { lines: { orderBy: { guildId: 'asc' } } }
    })
    expect(header.taxDue).toBe(1_000n)
    expect(header.taxPaid).toBe(600n)
    expect(header.unpaidAmount).toBe(400n)
    expect(header.lines[0]).toMatchObject({ taxDue: 500n, taxPaid: 500n })
    expect(header.lines[1]).toMatchObject({ taxDue: 500n, taxPaid: 100n })
  })

  it('guildId=null 판매분: 기본 세율로 과세하되 금고 적립 없이 라인만 남는다', async () => {
    await seedUser('u-null', 500_000n)
    await seedGuild('g-side', 0)
    await seedSale({ from: 'u-null', guildId: null, price: 10_000n })

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    expect(result.settledUsers).toBe(1)
    expect(result.totalTaxPaid).toBe(500n)
    expect(result.totalVaultDeposited).toBe(0n) // 적립 대상 서버 없음

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-null' }
    })
    expect(user.money).toBe(499_500n) // 과세는 됨 (화폐 sink)
    expect(await guildVault('g-side')).toBe(0n)

    const line = await testPrisma.weeklySettlementLine.findFirstOrThrow()
    expect(line.guildId).toBeNull()
    expect(line.taxPaid).toBe(500n)
    expect(line.appliedBps).toBe(500) // 가산세 0 — 누진 기본 세율만
  })

  it('집계 필터: price=0 회수·DIRECT_BUY·윈도 밖 거래는 과세되지 않는다', async () => {
    await seedUser('u-skip', 500_000n)
    await seedGuild('g-skip', 0)
    await seedSale({ from: 'u-skip', guildId: 'g-skip', price: 0n }) // 취소/만료 회수
    await seedSale({
      from: 'u-skip',
      guildId: 'g-skip',
      price: 10_000n,
      kind: 'DIRECT_BUY' // 직구매 지출 — 판매 수익 아님
    })
    await seedSale({
      from: 'u-skip',
      guildId: 'g-skip',
      price: 10_000n,
      at: BEFORE_WINDOW // 전전 주 거래
    })

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    expect(result.settledUsers).toBe(0)
    expect(await testPrisma.weeklySettlement.count()).toBe(0)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-skip' }
    })
    expect(user.money).toBe(500_000n)
    expect(await guildVault('g-skip')).toBe(0n)
  })

  it('weeklyDAU 갱신: distinct 유저 수 집계 + 무활동 서버 0 리셋 + 2주 초과 로그 정리', async () => {
    await seedGuild('g-active', 0)
    await seedGuild('g-idle', 0, 5) // 이전 주 DAU 5 — 이번 주 활동 없음 → 0

    // g-active: u1 이 이틀, u2 가 하루 활동 → distinct 2명.
    await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-active',
      userId: 'u1',
      now: new Date('2026-06-29T00:00:00Z')
    })
    await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-active',
      userId: 'u1',
      now: new Date('2026-07-01T00:00:00Z')
    })
    await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-active',
      userId: 'u2',
      now: new Date('2026-07-01T00:00:00Z')
    })
    // 보존 기간(2주)을 넘긴 옛 활동 — 정리 대상.
    await testPrisma.guildDailyActivity.create({
      data: {
        guildId: 'g-active',
        userId: 'u1',
        date: new Date('2026-06-10T15:00:00Z')
      }
    })

    const result = await WeeklySettlementService.settleWeek(testPrisma, {
      now: NOW
    })
    expect(result.dauUpdatedGuilds).toBe(1)
    expect(result.prunedActivityRows).toBe(1)

    const active = await testPrisma.guild.findUniqueOrThrow({
      where: { id: 'g-active' }
    })
    const idle = await testPrisma.guild.findUniqueOrThrow({
      where: { id: 'g-idle' }
    })
    expect(active.weeklyDAU).toBe(2)
    expect(idle.weeklyDAU).toBe(0)

    // 윈도 내 행은 보존 — 정리된 것은 2주 초과분 1행뿐.
    expect(await testPrisma.guildDailyActivity.count()).toBe(3)
  })
})

describe('WeeklySettlementService.guildSummary', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('정산 이력이 없으면 null, 있으면 최신 주 요약을 돌려준다', async () => {
    await seedGuild('g-sum', 0)
    expect(
      await WeeklySettlementService.guildSummary(testPrisma, 'g-sum')
    ).toBeNull()

    await seedUser('u-s1', 500_000n)
    await seedUser('u-s2', 500_000n)
    await seedSale({ from: 'u-s1', guildId: 'g-sum', price: 10_000n })
    await seedSale({ from: 'u-s2', guildId: 'g-sum', price: 20_000n })
    await WeeklySettlementService.settleWeek(testPrisma, { now: NOW })

    const summary = await WeeklySettlementService.guildSummary(
      testPrisma,
      'g-sum'
    )
    expect(summary).not.toBeNull()
    expect(summary!.weekStart.toISOString()).toBe(WEEK_START.toISOString())
    expect(summary!.salesRevenue).toBe(30_000n)
    expect(summary!.taxDue).toBe(1_500n)
    expect(summary!.taxPaid).toBe(1_500n)
    expect(summary!.userCount).toBe(2)
  })
})
