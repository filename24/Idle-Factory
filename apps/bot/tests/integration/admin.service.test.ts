/**
 * 운영 툴 통합 테스트 (#21 결정 6).
 *
 * 감사 로그가 **모든** 변경에 남는지가 이 스위트의 핵심이다 — 로그 없는 조작이
 * 하나라도 통과하면 운영 툴의 존재 의미가 사라진다.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AdminService, type AuditWebhookSender } from '../../src/services/admin'
import { ServiceError } from '../../src/services/base'
import { MarketService } from '../../src/services/market'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

const ACTOR = '900000000000000001'
const GUILD = '800000000000000001'
const SELLER = '700000000000000001'

async function seedGuild(credit: number) {
  await testPrisma.guild.create({
    data: { id: GUILD, name: 'test-guild', credit }
  })
}

async function seedGlobalPrice(currentPrice: bigint) {
  await testPrisma.globalMarketPrice.upsert({
    where: { material: 'GRAIN' },
    create: { material: 'GRAIN', basePrice: 10n, currentPrice },
    update: { currentPrice }
  })
}

async function seedListing(pricePerUnit: bigint, qty = 10n) {
  await UserService.ensure(testPrisma, { discordId: SELLER })
  const wh = await testPrisma.warehouse.findUniqueOrThrow({
    where: { userId: SELLER }
  })
  await testPrisma.warehouseStack.create({
    data: { warehouseId: wh.id, material: 'GRAIN', count: qty }
  })
  const result = await MarketService.list(testPrisma, {
    userId: SELLER,
    material: 'GRAIN',
    quantity: qty,
    pricePerUnit,
    durationDays: 7
  })
  return result.listing
}

describe('AdminService.setCredit', () => {
  beforeEach(async () => {
    await resetDb()
    AdminService.setAuditWebhook(null)
  })

  afterAll(async () => {
    AdminService.setAuditWebhook(null)
    await closeDb()
  })

  it('신뢰도를 절대값으로 설정하고 감사 로그를 남긴다', async () => {
    await seedGuild(1000)

    const result = await AdminService.setCredit(testPrisma, ACTOR, GUILD, 1500)

    expect(result).toEqual({ guildId: GUILD, before: 1000, after: 1500 })

    const guild = await testPrisma.guild.findUniqueOrThrow({
      where: { id: GUILD }
    })
    expect(guild.credit).toBe(1500)

    const logs = await testPrisma.adminAuditLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      actorId: ACTOR,
      action: 'CREDIT_SET',
      targetGuildId: GUILD,
      beforeValue: '1000',
      afterValue: '1500'
    })
  })

  it('0 과 2000 경계값을 허용한다', async () => {
    await seedGuild(1000)
    await expect(
      AdminService.setCredit(testPrisma, ACTOR, GUILD, 0)
    ).resolves.toMatchObject({
      after: 0
    })
    await expect(
      AdminService.setCredit(testPrisma, ACTOR, GUILD, 2000)
    ).resolves.toMatchObject({
      after: 2000
    })
  })

  it('범위를 벗어난 값은 거부하고 로그도 남기지 않는다', async () => {
    await seedGuild(1000)

    for (const bad of [-1, 2001, 1.5]) {
      await expect(
        AdminService.setCredit(testPrisma, ACTOR, GUILD, bad)
      ).rejects.toThrow(ServiceError)
    }

    const guild = await testPrisma.guild.findUniqueOrThrow({
      where: { id: GUILD }
    })
    expect(guild.credit).toBe(1000)
    expect(await testPrisma.adminAuditLog.count()).toBe(0)
  })

  it('없는 서버는 GUILD_NOT_FOUND', async () => {
    await expect(
      AdminService.setCredit(testPrisma, ACTOR, '111111111111111111', 500)
    ).rejects.toMatchObject({ code: 'GUILD_NOT_FOUND' })
  })
})

describe('AdminService.adjustCredit', () => {
  beforeEach(async () => {
    await resetDb()
    AdminService.setAuditWebhook(null)
  })

  afterAll(async () => {
    await closeDb()
  })

  it('상대 조정에 사유를 함께 기록한다', async () => {
    await seedGuild(1000)

    const result = await AdminService.adjustCredit(
      testPrisma,
      ACTOR,
      GUILD,
      -250,
      '어뮤징 신고 누적'
    )

    expect(result.after).toBe(750)
    const logs = await testPrisma.adminAuditLog.findMany()
    expect(logs[0]).toMatchObject({
      action: 'CREDIT_ADJUST',
      beforeValue: '1000',
      afterValue: '750',
      reason: '어뮤징 신고 누적'
    })
  })

  it('0~2000 범위를 벗어나면 도메인 함수가 클램프한다', async () => {
    await seedGuild(100)
    await expect(
      AdminService.adjustCredit(testPrisma, ACTOR, GUILD, -500, '테스트')
    ).resolves.toMatchObject({ before: 100, after: 0 })

    await AdminService.setCredit(testPrisma, ACTOR, GUILD, 1900)
    await expect(
      AdminService.adjustCredit(testPrisma, ACTOR, GUILD, 500, '테스트')
    ).resolves.toMatchObject({ after: 2000 })
  })

  it('사유가 없거나 공백이면 거부한다', async () => {
    await seedGuild(1000)
    for (const reason of ['', '   ']) {
      await expect(
        AdminService.adjustCredit(testPrisma, ACTOR, GUILD, -10, reason)
      ).rejects.toMatchObject({ code: 'AUDIT_REASON_REQUIRED' })
    }
    expect(await testPrisma.adminAuditLog.count()).toBe(0)
  })
})

describe('AdminService.marketOutliers', () => {
  beforeEach(async () => {
    await resetDb()
    AdminService.setAuditWebhook(null)
  })

  afterAll(async () => {
    await closeDb()
  })

  it('현재가 ±50% 안의 매물은 이상치가 아니다', async () => {
    await seedGlobalPrice(10n)
    await seedListing(12n)

    expect(await AdminService.marketOutliers(testPrisma)).toEqual([])
  })

  it('등록 후 글로벌 가격이 움직여 밴드를 벗어난 매물을 찾아낸다', async () => {
    // 등록 시점에는 10원 기준 ±50% 안(14원)이라 통과한다.
    await seedGlobalPrice(10n)
    const listing = await seedListing(14n)

    // 30분 가격 tick 으로 기준가가 내려가면 같은 매물이 밴드 밖으로 밀린다.
    await seedGlobalPrice(5n)

    const outliers = await AdminService.marketOutliers(testPrisma)
    expect(outliers).toHaveLength(1)
    expect(outliers[0]).toMatchObject({
      listingId: listing.id,
      material: 'GRAIN',
      price: 14n,
      globalPrice: 5n
    })
    expect(outliers[0]!.deviation).toBeCloseTo(1.8, 5)
  })

  it('limit 을 최대치로 클램프한다', async () => {
    await seedGlobalPrice(10n)
    expect(await AdminService.marketOutliers(testPrisma, 9999)).toEqual([])
    expect(await AdminService.marketOutliers(testPrisma, 0)).toEqual([])
  })
})

describe('AdminService.removeListing', () => {
  beforeEach(async () => {
    await resetDb()
    AdminService.setAuditWebhook(null)
  })

  afterAll(async () => {
    await closeDb()
  })

  it('소유자가 아니어도 회수하고 자재를 판매자 창고로 되돌린다', async () => {
    await seedGlobalPrice(10n)
    const listing = await seedListing(12n, 10n)

    const result = await AdminService.removeListing(
      testPrisma,
      ACTOR,
      listing.id,
      '가격 이상치'
    )

    expect(result).toMatchObject({
      listingId: listing.id,
      sellerId: SELLER,
      material: 'GRAIN',
      returnedQty: 10
    })

    const updated = await testPrisma.marketListing.findUniqueOrThrow({
      where: { id: listing.id }
    })
    expect(updated.status).toBe('CANCELED')

    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: SELLER }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: { warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' } }
    })
    expect(stack.count).toBe(10n)

    const logs = await testPrisma.adminAuditLog.findMany()
    expect(logs[0]).toMatchObject({
      action: 'LISTING_REMOVE',
      targetId: listing.id,
      beforeValue: 'ACTIVE',
      afterValue: 'CANCELED',
      reason: '가격 이상치'
    })
  })

  it('이미 회수된 매물은 LISTING_NOT_ACTIVE', async () => {
    await seedGlobalPrice(10n)
    const listing = await seedListing(12n)
    await AdminService.removeListing(testPrisma, ACTOR, listing.id)

    await expect(
      AdminService.removeListing(testPrisma, ACTOR, listing.id)
    ).rejects.toMatchObject({ code: 'LISTING_NOT_ACTIVE' })
  })

  it('없는 매물은 LISTING_NOT_FOUND', async () => {
    await expect(
      AdminService.removeListing(testPrisma, ACTOR, 'nonexistent-listing')
    ).rejects.toMatchObject({ code: 'LISTING_NOT_FOUND' })
  })
})

describe('감사 웹후크 주입', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    AdminService.setAuditWebhook(null)
    await closeDb()
  })

  it('등록된 전송자에게 감사 항목과 로그 id 를 넘긴다', async () => {
    const sent: Array<{ action: string; logId: string }> = []
    const sender: AuditWebhookSender = async (payload) => {
      sent.push({ action: payload.action, logId: payload.logId })
    }
    AdminService.setAuditWebhook(sender)
    await seedGuild(1000)

    await AdminService.setCredit(testPrisma, ACTOR, GUILD, 1200, '테스트')

    const logs = await testPrisma.adminAuditLog.findMany()
    expect(sent).toEqual([{ action: 'CREDIT_SET', logId: logs[0]!.id }])
  })

  it('전송자를 null 로 해제하면 호출되지 않는다', async () => {
    let called = 0
    AdminService.setAuditWebhook(async () => {
      called += 1
    })
    AdminService.setAuditWebhook(null)
    await seedGuild(1000)

    await AdminService.setCredit(testPrisma, ACTOR, GUILD, 1200)
    expect(called).toBe(0)
  })
})
