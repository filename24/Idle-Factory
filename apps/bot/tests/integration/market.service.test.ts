import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { MarketService } from '../../src/services/market'
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
