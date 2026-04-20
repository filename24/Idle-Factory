import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FactoryService } from '../../src/services/factory'
import { ServiceError } from '../../src/services/base'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUser(
  id: string,
  opts: { money?: bigint; level?: number } = {}
) {
  const user = await testPrisma.user.create({
    data: {
      id,
      money: opts.money ?? 100_000_000n,
      level: opts.level ?? 1
    }
  })
  const warehouse = await testPrisma.warehouse.create({
    data: { userId: user.id }
  })
  return { user, warehouse }
}

async function ensureMaterial(
  warehouseId: string,
  material: Parameters<
    typeof testPrisma.warehouseStack.create
  >[0]['data']['material'],
  count: bigint
) {
  await testPrisma.warehouseStack.upsert({
    where: { warehouseId_material: { warehouseId, material } },
    create: { warehouseId, material, count },
    update: { count }
  })
}

describe('FactoryService', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  describe('build', () => {
    it('builds FARM at (0,0), debits 1000 money, sets slot.factoryId', async () => {
      const { user } = await seedUser('u-build-1', { money: 5_000n })

      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      expect(factory.type).toBe('FARM')
      expect(factory.grade).toBe(1)
      expect(factory.anchorX).toBe(0)
      expect(factory.anchorY).toBe(0)

      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      expect(after.money).toBe(4_000n)

      const land = await testPrisma.land.findUniqueOrThrow({
        where: { userId: user.id },
        include: { slots: true }
      })
      const occupied = land.slots.filter((s) => s.factoryId === factory.id)
      expect(occupied).toHaveLength(1)
      expect(occupied[0]).toMatchObject({ x: 0, y: 0 })
    })

    it('throws INSUFFICIENT_MONEY when user.money=0', async () => {
      const { user } = await seedUser('u-build-2', { money: 0n })

      await expect(
        FactoryService.build(testPrisma, {
          userId: user.id,
          type: 'FARM',
          anchorX: 0,
          anchorY: 0
        })
      ).rejects.toMatchObject({ code: 'INSUFFICIENT_MONEY' })
    })

    it('throws LEVEL_LOCKED for STEEL_MILL at level 1', async () => {
      const { user } = await seedUser('u-build-3', {
        money: 1_000_000n,
        level: 1
      })

      await expect(
        FactoryService.build(testPrisma, {
          userId: user.id,
          type: 'STEEL_MILL',
          anchorX: 0,
          anchorY: 0
        })
      ).rejects.toMatchObject({ code: 'LEVEL_LOCKED' })
    })

    it('throws SLOT_OCCUPIED when building on the same cell twice', async () => {
      const { user } = await seedUser('u-build-4', { money: 10_000n })

      await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 1,
        anchorY: 1
      })

      await expect(
        FactoryService.build(testPrisma, {
          userId: user.id,
          type: 'MINE',
          anchorX: 1,
          anchorY: 1
        })
      ).rejects.toMatchObject({ code: 'SLOT_OCCUPIED' })
    })

    it('builds CAR_FACTORY (2x2) updating 4 slot.factoryId', async () => {
      const { user } = await seedUser('u-build-5', {
        money: 1_000_000n,
        level: 25
      })

      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'CAR_FACTORY',
        anchorX: 0,
        anchorY: 0
      })

      const land = await testPrisma.land.findUniqueOrThrow({
        where: { userId: user.id },
        include: { slots: true }
      })
      const occupied = land.slots.filter((s) => s.factoryId === factory.id)
      expect(occupied).toHaveLength(4)
      const coords = occupied.map((s) => `${s.x},${s.y}`).sort()
      expect(coords).toEqual(['0,0', '0,1', '1,0', '1,1'])

      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      expect(after.money).toBe(1_000_000n - 100_000n)
    })
  })

  describe('upgrade', () => {
    it('upgrades grade 1 → 2, debits money and material', async () => {
      const { user, warehouse } = await seedUser('u-up-1', {
        money: 100_000n
      })
      await ensureMaterial(warehouse.id, 'GRAIN', 100n)

      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      const moneyAfterBuild = (
        await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })
      ).money
      expect(moneyAfterBuild).toBe(99_000n)

      const upgraded = await FactoryService.upgrade(testPrisma, {
        userId: user.id,
        factoryId: factory.id
      })
      expect(upgraded.grade).toBe(2)

      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      expect(after.money).toBe(99_000n - 3_000n)

      const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
        where: {
          warehouseId_material: {
            warehouseId: warehouse.id,
            material: 'GRAIN'
          }
        }
      })
      expect(stack.count).toBe(100n - 20n)
    })

    it('throws MAX_GRADE at grade 10', async () => {
      const { user, warehouse } = await seedUser('u-up-2', {
        money: 10_000n
      })
      await ensureMaterial(warehouse.id, 'GRAIN', 0n)

      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
      await testPrisma.factory.update({
        where: { id: factory.id },
        data: { grade: 10 }
      })

      await expect(
        FactoryService.upgrade(testPrisma, {
          userId: user.id,
          factoryId: factory.id
        })
      ).rejects.toBeInstanceOf(ServiceError)
      await expect(
        FactoryService.upgrade(testPrisma, {
          userId: user.id,
          factoryId: factory.id
        })
      ).rejects.toMatchObject({ code: 'MAX_GRADE' })
    })
  })

  describe('setMode', () => {
    it('changes shortageMode', async () => {
      const { user } = await seedUser('u-mode-1', { money: 5_000n })
      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      const updated = await FactoryService.setMode(testPrisma, {
        userId: user.id,
        factoryId: factory.id,
        mode: 'AUTO_BUY'
      })
      expect(updated.shortageMode).toBe('AUTO_BUY')
    })
  })

  describe('info', () => {
    it('returns nextUpgradeCost for grade+1', async () => {
      const { user } = await seedUser('u-info-1', { money: 5_000n })
      const factory = await FactoryService.build(testPrisma, {
        userId: user.id,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      const info = await FactoryService.info(testPrisma, factory.id)
      expect(info.grade).toBe(1)
      expect(info.nextUpgradeCost.money).toBe(3_000n)
      expect(info.nextUpgradeCost.material).toEqual({
        material: 'GRAIN',
        amount: 20n
      })
      expect(info.unlockLevel).toBe(1)
    })
  })
})
