import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { RewardService } from '../../src/services/reward'
import { runInTx } from '../../src/services/base'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUserWithWarehouse(
  id: string,
  opts: { money?: bigint; level?: number; xp?: bigint } = {}
) {
  const user = await testPrisma.user.create({
    data: {
      id,
      money: opts.money ?? 0n,
      level: opts.level ?? 1,
      xp: opts.xp ?? 0n
    }
  })
  await testPrisma.warehouse.create({ data: { userId: user.id } })
  return user
}

describe('RewardService.grant', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('returns no-op for empty rewards array', async () => {
    await seedUserWithWarehouse('u-empty', { level: 3 })

    const result = await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-empty', [])
    )

    expect(result.granted).toEqual([])
    expect(result.leveledUp).toBe(false)
    expect(result.newLevel).toBe(3)
  })

  it('grants MONEY by incrementing User.money', async () => {
    await seedUserWithWarehouse('u-money', { money: 100n })

    const result = await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-money', [{ kind: 'MONEY', amount: 1_000n }])
    )

    expect(result.granted).toEqual([{ kind: 'MONEY', amount: 1_000n }])
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-money' }
    })
    expect(user.money).toBe(1_100n)
  })

  it('grants XP and applies level-up via applyXp', async () => {
    await seedUserWithWarehouse('u-xp', { level: 1, xp: 50n })

    // 50 + 100 = 150 — xpRequiredForLevel(1) = 100, so should level up to 2 with 50 remainder.
    const result = await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-xp', [{ kind: 'XP', amount: 100n }])
    )

    expect(result.leveledUp).toBe(true)
    expect(result.newLevel).toBe(2)
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-xp' }
    })
    expect(user.level).toBe(2)
    expect(user.xp).toBe(50n)
  })

  it('grants MATERIAL via WarehouseStack upsert (create when missing)', async () => {
    await seedUserWithWarehouse('u-mat')

    await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-mat', [
        { kind: 'MATERIAL', material: 'GRAIN', amount: 5n }
      ])
    )

    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-mat' }
    })
    const stack = await testPrisma.warehouseStack.findUnique({
      where: {
        warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' }
      }
    })
    expect(stack?.count).toBe(5n)
  })

  it('grants MATERIAL via WarehouseStack upsert (increment when present)', async () => {
    const user = await seedUserWithWarehouse('u-mat-existing')
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: user.id }
    })
    await testPrisma.warehouseStack.create({
      data: { warehouseId: wh.id, material: 'GRAIN', count: 10n }
    })

    await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, user.id, [
        { kind: 'MATERIAL', material: 'GRAIN', amount: 3n }
      ])
    )

    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: {
        warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' }
      }
    })
    expect(stack.count).toBe(13n)
  })

  it('handles mixed reward bundle in a single transaction', async () => {
    await seedUserWithWarehouse('u-mix', { money: 0n, level: 1, xp: 0n })

    const result = await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-mix', [
        { kind: 'MONEY', amount: 500n },
        { kind: 'XP', amount: 50n },
        { kind: 'MATERIAL', material: 'ORE', amount: 2n }
      ])
    )

    expect(result.granted).toHaveLength(3)
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-mix' }
    })
    expect(user.money).toBe(500n)
    expect(user.xp).toBe(50n)
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-mix' }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: { warehouseId_material: { warehouseId: wh.id, material: 'ORE' } }
    })
    expect(stack.count).toBe(2n)
  })

  it('skips zero-amount rewards', async () => {
    await seedUserWithWarehouse('u-zero', { money: 100n })

    const result = await runInTx(testPrisma, (tx) =>
      RewardService.grant(tx, 'u-zero', [{ kind: 'MONEY', amount: 0n }])
    )

    expect(result.granted).toEqual([])
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-zero' }
    })
    expect(user.money).toBe(100n)
  })

  it('throws USER_NOT_FOUND when user is missing', async () => {
    await expect(
      runInTx(testPrisma, (tx) =>
        RewardService.grant(tx, 'no-such-user', [{ kind: 'MONEY', amount: 1n }])
      )
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'USER_NOT_FOUND' })
  })
})
