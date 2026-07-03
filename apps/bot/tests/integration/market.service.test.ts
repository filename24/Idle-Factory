import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { MarketService, taxRateForDuration } from '../../src/services/market'
import { QuestService } from '../../src/services/quest'
import { UserService } from '../../src/services/user'
import { runInTx } from '../../src/services/base'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUserWithMaterial(id: string, grain: bigint) {
  await UserService.ensure(testPrisma, { discordId: id })
  const wh = await testPrisma.warehouse.findUniqueOrThrow({
    where: { userId: id }
  })
  await testPrisma.warehouseStack.create({
    data: { warehouseId: wh.id, material: 'GRAIN', count: grain }
  })
  return wh
}

async function seedBuyerWithMoney(id: string, money: bigint) {
  await UserService.ensure(testPrisma, { discordId: id })
  await testPrisma.user.update({
    where: { id },
    data: { money }
  })
}

async function listGrain(
  sellerId: string,
  qty: bigint,
  price: bigint,
  durationDays = 7
) {
  const r = await MarketService.list(testPrisma, {
    userId: sellerId,
    material: 'GRAIN',
    quantity: qty,
    pricePerUnit: price,
    durationDays
  })
  return r.listing
}

describe('MarketService.list', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects quantity < 1', async () => {
    await UserService.ensure(testPrisma, { discordId: 'u-mq' })
    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-mq',
        material: 'GRAIN',
        quantity: 0n,
        pricePerUnit: 10n,
        durationDays: 7
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_QUANTITY' })
  })

  it('rejects pricePerUnit < 1', async () => {
    await UserService.ensure(testPrisma, { discordId: 'u-mp' })
    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-mp',
        material: 'GRAIN',
        quantity: 1n,
        pricePerUnit: 0n,
        durationDays: 7
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_PRICE' })
  })

  it('rejects duration outside 1..30', async () => {
    await UserService.ensure(testPrisma, { discordId: 'u-md' })
    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-md',
        material: 'GRAIN',
        quantity: 1n,
        pricePerUnit: 10n,
        durationDays: 0
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_DURATION' })

    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-md',
        material: 'GRAIN',
        quantity: 1n,
        pricePerUnit: 10n,
        durationDays: 31
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_DURATION' })
  })

  it('throws INSUFFICIENT_MATERIAL when stack is missing', async () => {
    await UserService.ensure(testPrisma, { discordId: 'u-no-stack' })
    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-no-stack',
        material: 'GRAIN',
        quantity: 1n,
        pricePerUnit: 10n,
        durationDays: 7
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MATERIAL'
    })
  })

  it('throws INSUFFICIENT_MATERIAL when stack has too few', async () => {
    await seedUserWithMaterial('u-low', 3n)
    await expect(
      MarketService.list(testPrisma, {
        userId: 'u-low',
        material: 'GRAIN',
        quantity: 5n,
        pricePerUnit: 10n,
        durationDays: 7
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MATERIAL'
    })

    // 잔량은 그대로
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-low' }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: { warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' } }
    })
    expect(stack.count).toBe(3n)
  })

  it('successfully lists, debits warehouse, fires MARKET_LISTED quest event', async () => {
    await seedUserWithMaterial('u-ok', 10n)
    await runInTx(testPrisma, (tx) => QuestService.seedTutorial(tx, 'u-ok'))
    // 진행: tutorial.1 시드 후 곧장 자재 판매로 Q3 시드는 안되었지만 MARKET_LISTED 발화는 무해.

    const result = await MarketService.list(testPrisma, {
      userId: 'u-ok',
      material: 'GRAIN',
      quantity: 5n,
      pricePerUnit: 12n,
      durationDays: 7
    })

    expect(result.listing.material).toBe('GRAIN')
    expect(result.listing.qty).toBe(5)
    expect(result.listing.price).toBe(12n)
    expect(result.listing.status).toBe('ACTIVE')
    expect(result.listing.taxRate).toBeCloseTo(0.05)

    // 창고 차감 확인
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-ok' }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: { warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' } }
    })
    expect(stack.count).toBe(5n)

    // tutorial.1 (FACTORY_BUILT) 은 영향 없음 — MARKET_LISTED 와 트리거 다름
    const t1 = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: 'u-ok', questId: 'tutorial.1' }
    })
    expect(t1.status).toBe('IN_PROGRESS')
    expect(t1.progress).toBe(0n)
  })

  it('completes tutorial.3 (MARKET_LISTED) when seeded', async () => {
    await seedUserWithMaterial('u-q3', 10n)
    // tutorial.3 행 직접 시드 (정상 흐름은 Q1·Q2 클레임 후 자동 시드)
    await testPrisma.userQuest.create({
      data: {
        userId: 'u-q3',
        questId: 'tutorial.3',
        kind: 'TUTORIAL',
        target: 1n,
        rewardSnapshot: [{ kind: 'MONEY', amount: '500' }] as never
      }
    })

    const result = await MarketService.list(testPrisma, {
      userId: 'u-q3',
      material: 'GRAIN',
      quantity: 1n,
      pricePerUnit: 10n,
      durationDays: 5
    })

    expect(result.quest.newlyCompleted.map((q) => q.questId)).toContain(
      'tutorial.3'
    )

    const t3 = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: 'u-q3', questId: 'tutorial.3' }
    })
    expect(t3.status).toBe('COMPLETED')
    expect(t3.progress).toBe(1n)
  })
})

describe('taxRateForDuration', () => {
  it('matches the design table boundaries', () => {
    expect(taxRateForDuration(1)).toBeCloseTo(0.03)
    expect(taxRateForDuration(3)).toBeCloseTo(0.03)
    expect(taxRateForDuration(4)).toBeCloseTo(0.05)
    expect(taxRateForDuration(7)).toBeCloseTo(0.05)
    expect(taxRateForDuration(8)).toBeCloseTo(0.08)
    expect(taxRateForDuration(14)).toBeCloseTo(0.08)
    expect(taxRateForDuration(15)).toBeCloseTo(0.12)
    expect(taxRateForDuration(21)).toBeCloseTo(0.12)
    expect(taxRateForDuration(22)).toBeCloseTo(0.18)
    expect(taxRateForDuration(30)).toBeCloseTo(0.18)
  })
})

describe('MarketService.buy', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects unknown listing', async () => {
    await seedBuyerWithMoney('u-buy-x', 1000n)
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-buy-x',
        listingId: 'no-such-id'
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_FOUND'
    })
  })

  it('rejects already SOLD listing', async () => {
    await seedUserWithMaterial('u-seller', 5n)
    const listing = await listGrain('u-seller', 5n, 10n)
    await testPrisma.marketListing.update({
      where: { id: listing.id },
      data: { status: 'SOLD' }
    })
    await seedBuyerWithMoney('u-buyer-sold', 1000n)
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-buyer-sold',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_ACTIVE'
    })
  })

  it('rejects expired ACTIVE listing', async () => {
    await seedUserWithMaterial('u-seller-exp', 5n)
    const listing = await listGrain('u-seller-exp', 5n, 10n)
    await testPrisma.marketListing.update({
      where: { id: listing.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    })
    await seedBuyerWithMoney('u-buyer-exp', 1000n)
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-buyer-exp',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_ACTIVE'
    })
  })

  it('rejects self-purchase', async () => {
    await seedUserWithMaterial('u-self', 5n)
    const listing = await listGrain('u-self', 5n, 10n)
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-self',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'SELF_PURCHASE'
    })
  })

  it('rejects insufficient money', async () => {
    await seedUserWithMaterial('u-seller-m', 5n)
    const listing = await listGrain('u-seller-m', 5n, 100n) // gross 500
    await seedBuyerWithMoney('u-poor', 100n)
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-poor',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY'
    })
  })

  it('debits buyer, credits seller (after tax), stocks buyer warehouse, marks SOLD', async () => {
    await seedUserWithMaterial('u-s', 10n)
    // 7일 → taxRate 0.05
    const listing = await listGrain('u-s', 5n, 100n, 7)
    await seedBuyerWithMoney('u-b', 10_000n)

    const result = await MarketService.buy(testPrisma, {
      buyerId: 'u-b',
      listingId: listing.id
    })

    // gross = 5 * 100 = 500, tax = floor(500 * 0.05) = 25, net = 475
    expect(result.grossPrice).toBe(500n)
    expect(result.tax).toBe(25n)
    expect(result.netRevenue).toBe(475n)
    expect(result.listing.status).toBe('SOLD')

    // STARTER_MONEY = 1_000n (UserService.ensureWithinTx)
    const buyer = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-b' }
    })
    // seedBuyerWithMoney 가 STARTER_MONEY 를 덮어쓰며 10_000 으로 set → -500
    expect(buyer.money).toBe(9_500n)
    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-s' }
    })
    expect(seller.money).toBe(1_000n + 475n)

    const buyerWh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-b' }
    })
    const buyerStack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: {
        warehouseId_material: {
          warehouseId: buyerWh.id,
          material: 'GRAIN'
        }
      }
    })
    expect(buyerStack.count).toBe(5n)
  })

  it('second buy on the same listing rejects with LISTING_NOT_ACTIVE', async () => {
    await seedUserWithMaterial('u-once-s', 5n)
    const listing = await listGrain('u-once-s', 5n, 10n)
    await seedBuyerWithMoney('u-once-b1', 1000n)
    await seedBuyerWithMoney('u-once-b2', 1000n)

    await MarketService.buy(testPrisma, {
      buyerId: 'u-once-b1',
      listingId: listing.id
    })
    await expect(
      MarketService.buy(testPrisma, {
        buyerId: 'u-once-b2',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_ACTIVE'
    })
  })
})

describe('MarketService.cancel', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects unknown listing', async () => {
    await UserService.ensure(testPrisma, { discordId: 'u-cancel-x' })
    await expect(
      MarketService.cancel(testPrisma, {
        userId: 'u-cancel-x',
        listingId: 'no-such-id'
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_FOUND'
    })
  })

  it('rejects when caller is not the seller', async () => {
    await seedUserWithMaterial('u-owner', 5n)
    const listing = await listGrain('u-owner', 5n, 10n)
    await UserService.ensure(testPrisma, { discordId: 'u-other' })
    await expect(
      MarketService.cancel(testPrisma, {
        userId: 'u-other',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'NOT_LISTING_OWNER'
    })
  })

  it('rejects already SOLD listing', async () => {
    await seedUserWithMaterial('u-cs', 5n)
    const listing = await listGrain('u-cs', 5n, 10n)
    await testPrisma.marketListing.update({
      where: { id: listing.id },
      data: { status: 'SOLD' }
    })
    await expect(
      MarketService.cancel(testPrisma, {
        userId: 'u-cs',
        listingId: listing.id
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'LISTING_NOT_ACTIVE'
    })
  })

  it('returns stack to warehouse and marks CANCELED', async () => {
    await seedUserWithMaterial('u-cancel-ok', 10n) // 보유 10
    const listing = await listGrain('u-cancel-ok', 4n, 50n) // 차감 후 6 남음

    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-cancel-ok' }
    })
    const before = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: {
        warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' }
      }
    })
    expect(before.count).toBe(6n)

    const result = await MarketService.cancel(testPrisma, {
      userId: 'u-cancel-ok',
      listingId: listing.id
    })
    expect(result.listing.status).toBe('CANCELED')
    expect(result.returned).toEqual({ material: 'GRAIN', quantity: 4n })

    const after = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: {
        warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' }
      }
    })
    expect(after.count).toBe(10n) // 환원
  })
})

describe('MarketService.expireStale', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('does not touch future listings', async () => {
    await seedUserWithMaterial('u-future', 10n)
    const listing = await listGrain('u-future', 5n, 10n, 7)
    const result = await MarketService.expireStale(testPrisma)
    expect(result.expiredCount).toBe(0)
    const after = await testPrisma.marketListing.findUniqueOrThrow({
      where: { id: listing.id }
    })
    expect(after.status).toBe('ACTIVE')
  })

  it('expires past-due ACTIVE listings and returns stacks', async () => {
    await seedUserWithMaterial('u-past', 10n) // 보유 10 → 4 차감 → 6
    const listing = await listGrain('u-past', 4n, 10n)
    await testPrisma.marketListing.update({
      where: { id: listing.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    })

    const result = await MarketService.expireStale(testPrisma)
    expect(result.expiredCount).toBe(1)

    const after = await testPrisma.marketListing.findUniqueOrThrow({
      where: { id: listing.id }
    })
    expect(after.status).toBe('EXPIRED')

    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-past' }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: {
        warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' }
      }
    })
    expect(stack.count).toBe(10n) // 환원
  })

  it('skips already-non-ACTIVE listings even if expired', async () => {
    await seedUserWithMaterial('u-mix', 10n)
    const listing = await listGrain('u-mix', 5n, 10n)
    await testPrisma.marketListing.update({
      where: { id: listing.id },
      data: {
        status: 'CANCELED',
        expiresAt: new Date(Date.now() - 60_000)
      }
    })
    const result = await MarketService.expireStale(testPrisma)
    expect(result.expiredCount).toBe(0)
  })
})

describe('MarketService.browse', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('filters by material and excludes expired/sold', async () => {
    await seedUserWithMaterial('u-br', 20n)
    const a = await listGrain('u-br', 1n, 100n)
    const b = await listGrain('u-br', 1n, 50n)
    const c = await listGrain('u-br', 1n, 200n)

    // c 만 SOLD 처리
    await testPrisma.marketListing.update({
      where: { id: c.id },
      data: { status: 'SOLD' }
    })

    const result = await MarketService.browse(testPrisma, {
      material: 'GRAIN',
      page: 1,
      pageSize: 10
    })
    expect(result.total).toBe(2)
    expect(result.listings.map((l) => l.id).sort()).toEqual([a.id, b.id].sort())
    // 가격 오름차순
    expect(result.listings[0]!.price).toBeLessThanOrEqual(
      result.listings[1]!.price
    )
  })

  it('paginates correctly', async () => {
    await seedUserWithMaterial('u-page', 30n)
    for (let i = 0; i < 12; i++) {
      await listGrain('u-page', 1n, BigInt(10 + i))
    }
    const p1 = await MarketService.browse(testPrisma, { page: 1, pageSize: 5 })
    expect(p1.total).toBe(12)
    expect(p1.totalPages).toBe(3)
    expect(p1.listings).toHaveLength(5)
    const p3 = await MarketService.browse(testPrisma, { page: 3, pageSize: 5 })
    expect(p3.listings).toHaveLength(2)
  })
})

describe('MarketService.searchActiveForAutocomplete', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('returns recent listings (limit 25) when query is empty', async () => {
    await seedUserWithMaterial('u-ac', 30n)
    for (let i = 0; i < 30; i++) {
      await listGrain('u-ac', 1n, BigInt(10 + i))
    }
    const choices = await MarketService.searchActiveForAutocomplete(
      testPrisma,
      { query: '', limit: 25 }
    )
    expect(choices).toHaveLength(25)
  })

  it('matches material prefix (case-insensitive uppercased)', async () => {
    await seedUserWithMaterial('u-mat', 5n)
    await listGrain('u-mat', 1n, 10n)
    const choices = await MarketService.searchActiveForAutocomplete(
      testPrisma,
      { query: 'gra', limit: 25 }
    )
    expect(choices.length).toBeGreaterThan(0)
    expect(choices.every((c) => c.material === 'GRAIN')).toBe(true)
  })

  it('matches listing id prefix', async () => {
    await seedUserWithMaterial('u-id', 5n)
    const listing = await listGrain('u-id', 1n, 10n)
    const choices = await MarketService.searchActiveForAutocomplete(
      testPrisma,
      { query: listing.id.slice(0, 6), limit: 25 }
    )
    expect(choices.map((c) => c.id)).toContain(listing.id)
  })

  it('excludes SOLD/EXPIRED/CANCELED and time-expired listings', async () => {
    await seedUserWithMaterial('u-ex', 20n)
    const sold = await listGrain('u-ex', 1n, 10n)
    const expired = await listGrain('u-ex', 1n, 11n)
    const canceled = await listGrain('u-ex', 1n, 12n)
    const timeExpired = await listGrain('u-ex', 1n, 13n)
    const ok = await listGrain('u-ex', 1n, 14n)

    await testPrisma.marketListing.update({
      where: { id: sold.id },
      data: { status: 'SOLD' }
    })
    await testPrisma.marketListing.update({
      where: { id: expired.id },
      data: { status: 'EXPIRED' }
    })
    await testPrisma.marketListing.update({
      where: { id: canceled.id },
      data: { status: 'CANCELED' }
    })
    await testPrisma.marketListing.update({
      where: { id: timeExpired.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    })

    const choices = await MarketService.searchActiveForAutocomplete(
      testPrisma,
      { query: '', limit: 25 }
    )
    expect(choices.map((c) => c.id)).toEqual([ok.id])
  })
})

// ──────────────────────────────────────────────────────────────
// issue #26 — TradeLog 기록 · 판매자 XP 정합 · 반복 상대 감쇠 v0
// ──────────────────────────────────────────────────────────────

async function seedGuild(id: string): Promise<void> {
  await testPrisma.guild.create({ data: { id, name: `guild-${id}` } })
}

describe('MarketService.buy — TradeLog + 판매자 XP (issue #26)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('records a MARKET_SELL TradeLog (from=seller, to=buyer, amount=qty, price=gross, guildId)', async () => {
    await seedGuild('g-trade')
    await seedUserWithMaterial('u-sell-log', 10n)
    const listing = await listGrain('u-sell-log', 5n, 100n, 7) // gross = 500
    await seedBuyerWithMoney('u-buy-log', 10_000n)

    await MarketService.buy(testPrisma, {
      buyerId: 'u-buy-log',
      listingId: listing.id,
      guildId: 'g-trade'
    })

    const logs = await testPrisma.tradeLog.findMany({
      where: { kind: 'MARKET_SELL' }
    })
    expect(logs).toHaveLength(1)
    const log = logs[0]!
    expect(log.fromUserId).toBe('u-sell-log')
    expect(log.toUserId).toBe('u-buy-log')
    expect(log.material).toBe('GRAIN')
    expect(log.amount).toBe(5n)
    expect(log.price).toBe(500n) // gross
    expect(log.guildId).toBe('g-trade')
  })

  it('degrades guildId to null when the referenced guild is not seeded (FK guard)', async () => {
    await seedUserWithMaterial('u-sell-ng', 5n)
    const listing = await listGrain('u-sell-ng', 5n, 10n)
    await seedBuyerWithMoney('u-buy-ng', 1000n)

    await MarketService.buy(testPrisma, {
      buyerId: 'u-buy-ng',
      listingId: listing.id,
      guildId: 'g-missing'
    })

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { kind: 'MARKET_SELL' }
    })
    expect(log.guildId).toBeNull()
  })

  it('grants the seller +20 XP (MARKET_SELL) and applies level-up; buyer gets no XP', async () => {
    await seedUserWithMaterial('u-sell-xp', 5n)
    // 판매자 Lv1, xp 90 → +20 = 110 ≥ 100(req Lv1) → Lv2, 잔여 10.
    await testPrisma.user.update({
      where: { id: 'u-sell-xp' },
      data: { level: 1, xp: 90n }
    })
    const listing = await listGrain('u-sell-xp', 5n, 100n, 7)
    await seedBuyerWithMoney('u-buy-xp', 10_000n)

    const result = await MarketService.buy(testPrisma, {
      buyerId: 'u-buy-xp',
      listingId: listing.id
    })

    expect(result.sellerXpAwarded).toBe(20n)
    expect(result.sellerLeveledUp).toBe(true)
    expect(result.sellerNewLevel).toBe(2)

    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-sell-xp' }
    })
    expect(seller.level).toBe(2)
    expect(seller.xp).toBe(10n)

    // 구매자 XP 는 설계상 없음 (docs/design/09-level-xp.md §이벤트별 XP).
    const buyer = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-buy-xp' }
    })
    expect(buyer.xp).toBe(0n)
    expect(buyer.level).toBe(1)
  })

  it('captures listing.guildId at registration and inherits it on expire', async () => {
    await seedGuild('g-list')
    await seedUserWithMaterial('u-list-g', 5n)
    const r = await MarketService.list(testPrisma, {
      userId: 'u-list-g',
      material: 'GRAIN',
      quantity: 5n,
      pricePerUnit: 10n,
      durationDays: 7,
      guildId: 'g-list'
    })
    const listing = await testPrisma.marketListing.findUniqueOrThrow({
      where: { id: r.listing.id }
    })
    expect(listing.guildId).toBe('g-list')
  })
})

describe('MarketService.buy — 반복 상대 XP 감쇠 v0 (issue #26)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  /** 최근 24h 내 동일 (seller→buyer) 실판매 로그를 n건 시드한다. */
  async function seedRecentSales(
    sellerId: string,
    buyerId: string,
    n: number
  ): Promise<void> {
    for (let i = 0; i < n; i++) {
      await testPrisma.tradeLog.create({
        data: {
          fromUserId: sellerId,
          toUserId: buyerId,
          kind: 'MARKET_SELL',
          material: 'GRAIN',
          amount: 1n,
          price: 100n
        }
      })
    }
  }

  it('grants 0 XP on the 6th sale to the same counterparty within 24h', async () => {
    await seedUserWithMaterial('u-decay-s', 5n)
    const listing = await listGrain('u-decay-s', 5n, 100n, 7)
    await seedBuyerWithMoney('u-decay-b', 10_000n)
    await seedRecentSales('u-decay-s', 'u-decay-b', 5) // 현재 건은 6회차

    const before = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-decay-s' }
    })

    const result = await MarketService.buy(testPrisma, {
      buyerId: 'u-decay-b',
      listingId: listing.id
    })

    expect(result.sellerXpAwarded).toBe(0n)
    expect(result.sellerLeveledUp).toBe(false)

    const after = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-decay-s' }
    })
    // XP·레벨 불변, 대금(MONEY)은 정상 지급.
    expect(after.xp).toBe(before.xp)
    expect(after.level).toBe(before.level)
    expect(after.money).toBeGreaterThan(before.money)
  })

  it('grants 50% XP (10) on the 4th sale to the same counterparty within 24h', async () => {
    await seedUserWithMaterial('u-half-s', 5n)
    const listing = await listGrain('u-half-s', 5n, 10n, 7)
    await seedBuyerWithMoney('u-half-b', 10_000n)
    await seedRecentSales('u-half-s', 'u-half-b', 3) // 현재 건은 4회차

    const result = await MarketService.buy(testPrisma, {
      buyerId: 'u-half-b',
      listingId: listing.id
    })

    expect(result.sellerXpAwarded).toBe(10n) // floor(20 × 5000/10000)
  })

  it('ignores return records (toUserId=null) — sale after cancels still gets full 100% XP', async () => {
    await seedUserWithMaterial('u-ret-s', 5n)
    const listing = await listGrain('u-ret-s', 5n, 100n, 7)
    await seedBuyerWithMoney('u-ret-b', 10_000n)
    // 회수 로그(toUserId=null)만 6건 — 감쇠 카운트에 잡히면 안 됨.
    for (let i = 0; i < 6; i++) {
      await testPrisma.tradeLog.create({
        data: {
          fromUserId: 'u-ret-s',
          toUserId: null,
          kind: 'MARKET_SELL',
          material: 'GRAIN',
          amount: 1n,
          price: 0n
        }
      })
    }

    const result = await MarketService.buy(testPrisma, {
      buyerId: 'u-ret-b',
      listingId: listing.id
    })

    expect(result.sellerXpAwarded).toBe(20n) // 첫 실판매 → 100%
  })
})

describe('MarketService.cancel / expireStale — 회수 TradeLog (issue #26)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('cancel records a return TradeLog (toUserId=null, price=0, amount=qty, guildId)', async () => {
    await seedGuild('g-cancel')
    await seedUserWithMaterial('u-cancel-log', 8n)
    const listing = await listGrain('u-cancel-log', 4n, 50n)

    await MarketService.cancel(testPrisma, {
      userId: 'u-cancel-log',
      listingId: listing.id,
      guildId: 'g-cancel'
    })

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { fromUserId: 'u-cancel-log' }
    })
    expect(log.kind).toBe('MARKET_SELL')
    expect(log.toUserId).toBeNull()
    expect(log.price).toBe(0n)
    expect(log.amount).toBe(4n)
    expect(log.guildId).toBe('g-cancel')
  })

  it('expireStale records return TradeLogs (toUserId=null, price=0, inherits listing guildId)', async () => {
    await seedGuild('g-expire')
    await seedUserWithMaterial('u-expire-log', 6n)
    const r = await MarketService.list(testPrisma, {
      userId: 'u-expire-log',
      material: 'GRAIN',
      quantity: 3n,
      pricePerUnit: 20n,
      durationDays: 7,
      guildId: 'g-expire'
    })
    await testPrisma.marketListing.update({
      where: { id: r.listing.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    })

    const result = await MarketService.expireStale(testPrisma)
    expect(result.expiredCount).toBe(1)

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { fromUserId: 'u-expire-log' }
    })
    expect(log.toUserId).toBeNull()
    expect(log.price).toBe(0n)
    expect(log.amount).toBe(3n)
    expect(log.guildId).toBe('g-expire') // 등록 시점 캡처값 승계
  })

  it('expireStale degrades an unseeded listing guildId to null (batch FK guard)', async () => {
    await seedUserWithMaterial('u-expire-ng', 4n)
    const r = await MarketService.list(testPrisma, {
      userId: 'u-expire-ng',
      material: 'GRAIN',
      quantity: 2n,
      pricePerUnit: 10n,
      durationDays: 7,
      guildId: 'g-ghost' // Guild 행 미시드 — FK 위반 없이 null 로 낮아져야 함
    })
    await testPrisma.marketListing.update({
      where: { id: r.listing.id },
      data: { expiresAt: new Date(Date.now() - 60_000) }
    })

    const result = await MarketService.expireStale(testPrisma)
    expect(result.expiredCount).toBe(1)

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { fromUserId: 'u-expire-ng' }
    })
    expect(log.guildId).toBeNull()
    expect(log.toUserId).toBeNull()
    expect(log.price).toBe(0n)
  })
})
