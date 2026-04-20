import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ServiceError } from '../../src/services/base'
import { WarehouseService } from '../../src/services/warehouse'
import { closeDb, resetDb, testPrisma } from './setup'

interface SeedOptions {
  readonly userId?: string
  readonly money?: bigint
  readonly grade?: number
  readonly stacks?: Readonly<Record<string, bigint>>
}

async function seedUserWithWarehouse(opts: SeedOptions = {}): Promise<string> {
  const userId = opts.userId ?? 'wh-test-user'
  const money = opts.money ?? 0n
  const grade = opts.grade ?? 1

  await testPrisma.user.create({
    data: { id: userId, nickname: 'wh-test', money }
  })
  const wh = await testPrisma.warehouse.create({
    data: { userId, grade }
  })

  if (opts.stacks) {
    for (const [material, count] of Object.entries(opts.stacks)) {
      await testPrisma.warehouseStack.create({
        data: {
          warehouseId: wh.id,
          material: material as 'WOOD' | 'STEEL' | 'CAR',
          count
        }
      })
    }
  }
  return userId
}

describe('WarehouseService', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  describe('view', () => {
    it('returns grade 1 with capacity 1000 and empty stacks for new user', async () => {
      const userId = await seedUserWithWarehouse()

      const view = await WarehouseService.view(testPrisma, userId)

      expect(view.grade).toBe(1)
      expect(view.capacity).toBe(1_000n)
      expect(view.used).toBe(0n)
      expect(view.free).toBe(1_000n)
      expect(view.stacks).toEqual([])
    })

    it('computes used as the sum of all stack counts', async () => {
      const userId = await seedUserWithWarehouse({
        stacks: { WOOD: 120n, STEEL: 30n }
      })

      const view = await WarehouseService.view(testPrisma, userId)

      expect(view.used).toBe(150n)
      expect(view.free).toBe(850n)
      expect(view.stacks).toHaveLength(2)
      const byMat = Object.fromEntries(
        view.stacks.map((s) => [s.material, s.count])
      )
      expect(byMat.WOOD).toBe(120n)
      expect(byMat.STEEL).toBe(30n)
    })
  })

  describe('upgrade', () => {
    it('grade 1 -> 2 debits 5000 money and 100 WOOD', async () => {
      const userId = await seedUserWithWarehouse({
        money: 10_000n,
        stacks: { WOOD: 500n }
      })

      const view = await WarehouseService.upgrade(testPrisma, userId)

      expect(view.grade).toBe(2)
      expect(view.capacity).toBe(3_000n)

      const user = await testPrisma.user.findUniqueOrThrow({
        where: { id: userId }
      })
      expect(user.money).toBe(5_000n)

      const wood = await testPrisma.warehouseStack.findFirstOrThrow({
        where: { warehouse: { userId }, material: 'WOOD' }
      })
      expect(wood.count).toBe(400n)
    })

    it('throws INSUFFICIENT_MONEY when money is below cost', async () => {
      const userId = await seedUserWithWarehouse({
        money: 100n,
        stacks: { WOOD: 500n }
      })

      await expect(
        WarehouseService.upgrade(testPrisma, userId)
      ).rejects.toMatchObject({
        name: 'ServiceError',
        code: 'INSUFFICIENT_MONEY'
      })

      const user = await testPrisma.user.findUniqueOrThrow({
        where: { id: userId }
      })
      expect(user.money).toBe(100n)
      const wh = await testPrisma.warehouse.findUniqueOrThrow({
        where: { userId }
      })
      expect(wh.grade).toBe(1)
    })

    it('throws INSUFFICIENT_MATERIAL when WOOD is missing', async () => {
      const userId = await seedUserWithWarehouse({ money: 10_000n })

      await expect(
        WarehouseService.upgrade(testPrisma, userId)
      ).rejects.toMatchObject({
        name: 'ServiceError',
        code: 'INSUFFICIENT_MATERIAL'
      })

      const user = await testPrisma.user.findUniqueOrThrow({
        where: { id: userId }
      })
      expect(user.money).toBe(10_000n)
    })

    it('throws MAX_GRADE when already at grade 10', async () => {
      const userId = await seedUserWithWarehouse({
        grade: 10,
        money: 100_000_000n,
        stacks: { CAR: 100n }
      })

      const err = await WarehouseService.upgrade(testPrisma, userId).catch(
        (e) => e
      )
      expect(err).toBeInstanceOf(ServiceError)
      expect((err as ServiceError).code).toBe('MAX_GRADE')

      const wh = await testPrisma.warehouse.findUniqueOrThrow({
        where: { userId }
      })
      expect(wh.grade).toBe(10)
    })
  })
})
