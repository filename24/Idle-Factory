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
