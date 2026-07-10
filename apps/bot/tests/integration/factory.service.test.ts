import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { FactoryService } from '../../src/services/factory'
import { ServiceError } from '../../src/services/base'
import { createLandWithSlots } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUser(
  id: string,
  opts: { money?: bigint; level?: number; extraLandIndices?: number[] } = {}
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
  // Starter land (index 1) is normally created by UserService.ensure; tests that
  // bypass UserService must seed it here since FactoryService no longer auto-creates.
  await testPrisma.$transaction(async (tx) => {
    await createLandWithSlots(tx, user.id, 1)
    for (const idx of opts.extraLandIndices ?? []) {
      await createLandWithSlots(tx, user.id, idx)
    }
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

      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
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
        where: { userId_index: { userId: user.id, index: 1 } },
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
          landIndex: 1,
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
          landIndex: 1,
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
        landIndex: 1,
        type: 'FARM',
        anchorX: 1,
        anchorY: 1
      })

      await expect(
        FactoryService.build(testPrisma, {
          userId: user.id,
          landIndex: 1,
          type: 'MINE',
          anchorX: 1,
          anchorY: 1
        })
      ).rejects.toMatchObject({ code: 'SLOT_OCCUPIED' })
    })

    it('builds CAR_FACTORY (2x2) updating 4 slot.factoryId', async () => {
      const { user, warehouse } = await seedUser('u-build-5', {
        money: 1_000_000n,
        level: 25
      })
      await ensureMaterial(warehouse.id, 'STEEL', 100n)

      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'CAR_FACTORY',
        anchorX: 0,
        anchorY: 0
      })

      const land = await testPrisma.land.findUniqueOrThrow({
        where: { userId_index: { userId: user.id, index: 1 } },
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

    it('throws LAND_NOT_FOUND when building on a land the user does not own', async () => {
      const { user } = await seedUser('u-build-noland', { money: 10_000n })

      await expect(
        FactoryService.build(testPrisma, {
          userId: user.id,
          landIndex: 3,
          type: 'FARM',
          anchorX: 0,
          anchorY: 0
        })
      ).rejects.toMatchObject({ code: 'LAND_NOT_FOUND' })
    })

    it('builds on land 2 without affecting land 1 (isolation by landId)', async () => {
      const { user } = await seedUser('u-build-multi', {
        money: 10_000n,
        extraLandIndices: [2]
      })

      // Build FARM at (0,0) on land 2.
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 2,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
      expect(factory.landId).toBeDefined()

      // Land 2 (0,0) now occupied.
      const land2 = await testPrisma.land.findUniqueOrThrow({
        where: { userId_index: { userId: user.id, index: 2 } },
        include: { slots: true }
      })
      const occ2 = land2.slots.filter((s) => s.factoryId === factory.id)
      expect(occ2).toHaveLength(1)
      expect(occ2[0]).toMatchObject({ x: 0, y: 0 })

      // Land 1 (0,0) must still be free.
      const land1 = await testPrisma.land.findUniqueOrThrow({
        where: { userId_index: { userId: user.id, index: 1 } },
        include: { slots: true }
      })
      const land1Cell = land1.slots.find((s) => s.x === 0 && s.y === 0)
      expect(land1Cell?.factoryId).toBeNull()

      // Building on land 1 same coordinates is still allowed.
      await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
    })
  })

  describe('upgrade', () => {
    it('upgrades grade 1 → 2, debits money and material', async () => {
      const { user, warehouse } = await seedUser('u-up-1', {
        money: 100_000n
      })
      await ensureMaterial(warehouse.id, 'GRAIN', 100n)

      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      const moneyAfterBuild = (
        await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })
      ).money
      expect(moneyAfterBuild).toBe(99_000n)

      const { factory: upgraded } = await FactoryService.upgrade(testPrisma, {
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

      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
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
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
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
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
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

  describe('destroy', () => {
    it('refunds 50% of build cost, frees slots, deletes factory', async () => {
      const { user } = await seedUser('u-destroy-1', { money: 5_000n })
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
      const afterBuild = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      expect(afterBuild.money).toBe(4_000n)

      const result = await FactoryService.destroy(testPrisma, {
        userId: user.id,
        factoryId: factory.id
      })
      // FARM buildCost = 1_000n → refund 500n.
      expect(result.refund).toBe(500n)
      expect(result.remainingMoney).toBe(4_500n)
      expect(result.landIndex).toBe(1)

      const gone = await testPrisma.factory.findUnique({
        where: { id: factory.id }
      })
      expect(gone).toBeNull()

      // Slot at (0,0) freed → can rebuild.
      const land = await testPrisma.land.findUniqueOrThrow({
        where: { userId_index: { userId: user.id, index: 1 } },
        include: { slots: true }
      })
      const cell = land.slots.find((s) => s.x === 0 && s.y === 0)
      expect(cell?.factoryId).toBeNull()
    })

    it('frees all 4 slots of a 2x2 factory', async () => {
      const { user, warehouse } = await seedUser('u-destroy-2', {
        money: 1_000_000n,
        level: 25
      })
      await ensureMaterial(warehouse.id, 'STEEL', 100n)
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'CAR_FACTORY',
        anchorX: 0,
        anchorY: 0
      })

      await FactoryService.destroy(testPrisma, {
        userId: user.id,
        factoryId: factory.id
      })

      const land = await testPrisma.land.findUniqueOrThrow({
        where: { userId_index: { userId: user.id, index: 1 } },
        include: { slots: true }
      })
      for (const [x, y] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1]
      ] as const) {
        const slot = land.slots.find((s) => s.x === x && s.y === y)
        expect(slot?.factoryId).toBeNull()
      }
    })

    it('blocks destroying a listed factory (FACTORY_LISTED)', async () => {
      const { user } = await seedUser('u-destroy-listed', { money: 5_000n })
      const { factory } = await FactoryService.build(testPrisma, {
        userId: user.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })
      // 상장 종목 시드 — 철거 시 Cascade 로 주주 지분이 증발하므로 차단 (#18).
      await testPrisma.stock.create({
        data: {
          factoryId: factory.id,
          market: 'SERVER',
          ipoPrice: 1_000n,
          currentPrice: 1_000n
        }
      })

      await expect(
        FactoryService.destroy(testPrisma, {
          userId: user.id,
          factoryId: factory.id
        })
      ).rejects.toMatchObject({
        name: 'ServiceError',
        code: 'FACTORY_LISTED'
      })

      // 공장·종목 모두 보존 — 환불도 발생하지 않는다.
      const kept = await testPrisma.factory.findUnique({
        where: { id: factory.id }
      })
      expect(kept).not.toBeNull()
      expect(await testPrisma.stock.count()).toBe(1)
      const after = await testPrisma.user.findUniqueOrThrow({
        where: { id: user.id }
      })
      expect(after.money).toBe(4_000n) // 빌드 후 잔액 그대로 (환불 없음).
    })

    it('throws FACTORY_NOT_FOUND for a factory owned by another user', async () => {
      const { user: a } = await seedUser('u-destroy-a', { money: 5_000n })
      await seedUser('u-destroy-b', { money: 5_000n })
      const { factory } = await FactoryService.build(testPrisma, {
        userId: a.id,
        landIndex: 1,
        type: 'FARM',
        anchorX: 0,
        anchorY: 0
      })

      await expect(
        FactoryService.destroy(testPrisma, {
          userId: 'u-destroy-b',
          factoryId: factory.id
        })
      ).rejects.toMatchObject({
        name: 'ServiceError',
        code: 'FACTORY_NOT_FOUND'
      })
    })
  })
})
