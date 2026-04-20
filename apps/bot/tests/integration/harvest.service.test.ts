import { TICK_MS, xpForEvent } from '@idle/game-core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { HarvestService } from '../../src/services/harvest'
import { closeDb, resetDb, testPrisma } from './setup'

const THIRTY_MIN_MS = 30 * 60 * 1000

interface SeedOpts {
  readonly discordId: string
  readonly warehouseGrade?: number
  readonly stacks?: Record<string, bigint>
}

/**
 * Seed a user + 3x3 NORMAL-only land + warehouse. We create slots manually
 * (bypassing UserService) so every slot is NORMAL — keeping factory yield
 * deterministic with no special-slot bonus.
 */
async function seedBase(opts: SeedOpts) {
  const { discordId, warehouseGrade = 1, stacks = {} } = opts

  await testPrisma.user.create({
    data: { id: discordId, nickname: 'harvest-test' }
  })

  const land = await testPrisma.land.create({
    data: { userId: discordId, width: 3, height: 3 }
  })

  const slotRows = []
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      slotRows.push({ landId: land.id, x, y, type: 'NORMAL' as const })
    }
  }
  await testPrisma.slot.createMany({ data: slotRows })

  const warehouse = await testPrisma.warehouse.create({
    data: { userId: discordId, grade: warehouseGrade }
  })

  for (const [material, count] of Object.entries(stacks)) {
    await testPrisma.warehouseStack.create({
      data: {
        warehouseId: warehouse.id,
        material: material as 'GRAIN' | 'ORE' | 'STEEL',
        count
      }
    })
  }

  return { land, warehouse }
}

async function placeFactory(params: {
  userId: string
  landId: string
  type: 'FARM' | 'STEEL_MILL'
  tier: 'T1' | 'T2'
  anchorX: number
  anchorY: number
  lastHarvestAt: Date
  shortageMode?: 'PAUSE' | 'AUTO_BUY' | 'PARTIAL'
}) {
  const factory = await testPrisma.factory.create({
    data: {
      userId: params.userId,
      type: params.type,
      tier: params.tier,
      grade: 1,
      anchorX: params.anchorX,
      anchorY: params.anchorY,
      width: 1,
      height: 1,
      lastHarvestAt: params.lastHarvestAt,
      shortageMode: params.shortageMode ?? 'PAUSE'
    }
  })

  await testPrisma.slot.updateMany({
    where: {
      landId: params.landId,
      x: params.anchorX,
      y: params.anchorY
    },
    data: { factoryId: factory.id }
  })

  return factory
}

describe('HarvestService.harvestAll', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('produces 3 ticks of GRAIN for a FARM with 30 minutes elapsed', async () => {
    const discordId = 'harvest-farm-001'
    const thirtyMinAgo = new Date(Date.now() - THIRTY_MIN_MS)

    const { land } = await seedBase({ discordId })
    const factory = await placeFactory({
      userId: discordId,
      landId: land.id,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0,
      lastHarvestAt: thirtyMinAgo
    })
    const before = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })

    const result = await HarvestService.harvestAll(testPrisma, discordId)

    expect(result.factories).toHaveLength(1)
    expect(result.factories[0]!.ticks).toBe(3)
    expect(result.factories[0]!.produced.GRAIN).toBe(90n)

    const grain = await testPrisma.warehouseStack.findFirst({
      where: {
        warehouse: { userId: discordId },
        material: 'GRAIN'
      }
    })
    expect(grain?.count).toBe(90n)

    const after = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })
    expect(after.lastHarvestAt.getTime()).toBe(
      before.lastHarvestAt.getTime() + 3 * TICK_MS
    )

    expect(result.xpGained).toBe(
      xpForEvent({ kind: 'TICK_PRODUCTION', ticks: 3 })
    )
  })

  it('STEEL_MILL consumes 9 ORE and produces 15 STEEL with 30 minutes elapsed', async () => {
    const discordId = 'harvest-mill-001'
    const thirtyMinAgo = new Date(Date.now() - THIRTY_MIN_MS)

    const { land } = await seedBase({
      discordId,
      stacks: { ORE: 10n }
    })
    const factory = await placeFactory({
      userId: discordId,
      landId: land.id,
      type: 'STEEL_MILL',
      tier: 'T2',
      anchorX: 1,
      anchorY: 1,
      lastHarvestAt: thirtyMinAgo
    })

    const result = await HarvestService.harvestAll(testPrisma, discordId)

    expect(result.factories).toHaveLength(1)
    const summary = result.factories[0]!
    expect(summary.ticks).toBe(3)
    expect(summary.consumed.ORE).toBe(9n)
    expect(summary.produced.STEEL).toBe(15n)

    const ore = await testPrisma.warehouseStack.findFirst({
      where: { warehouse: { userId: discordId }, material: 'ORE' }
    })
    expect(ore?.count).toBe(1n)

    const steel = await testPrisma.warehouseStack.findFirst({
      where: { warehouse: { userId: discordId }, material: 'STEEL' }
    })
    expect(steel?.count).toBe(15n)

    const after = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })
    expect(after.lastHarvestAt.getTime() - thirtyMinAgo.getTime()).toBe(
      3 * TICK_MS
    )
  })

  it('PAUSE mode with insufficient materials produces 0 ticks; lastHarvestAt unchanged', async () => {
    const discordId = 'harvest-pause-001'
    const thirtyMinAgo = new Date(Date.now() - THIRTY_MIN_MS)

    const { land } = await seedBase({
      discordId,
      stacks: { ORE: 2n }
    })
    const factory = await placeFactory({
      userId: discordId,
      landId: land.id,
      type: 'STEEL_MILL',
      tier: 'T2',
      anchorX: 0,
      anchorY: 0,
      lastHarvestAt: thirtyMinAgo,
      shortageMode: 'PAUSE'
    })
    const before = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })

    const result = await HarvestService.harvestAll(testPrisma, discordId)

    expect(result.factories).toHaveLength(0)
    expect(result.xpGained).toBe(0n)

    const ore = await testPrisma.warehouseStack.findFirst({
      where: { warehouse: { userId: discordId }, material: 'ORE' }
    })
    expect(ore?.count).toBe(2n)

    const steel = await testPrisma.warehouseStack.findFirst({
      where: { warehouse: { userId: discordId }, material: 'STEEL' }
    })
    expect(steel).toBeNull()

    const after = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })
    expect(after.lastHarvestAt.getTime()).toBe(before.lastHarvestAt.getTime())
  })

  it('clamps yield to warehouse free space and advances lastHarvestAt only by realized ticks', async () => {
    const discordId = 'harvest-clamp-001'
    const thirtyMinAgo = new Date(Date.now() - THIRTY_MIN_MS)

    // Grade-1 capacity = 1000. Pre-fill 955 → free = 45.
    // FARM = 30/tick. 3 ticks → 90, clamped to floor(45/30) = 1 tick → 30.
    const { land } = await seedBase({
      discordId,
      stacks: { GRAIN: 955n }
    })
    const factory = await placeFactory({
      userId: discordId,
      landId: land.id,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0,
      lastHarvestAt: thirtyMinAgo
    })

    const result = await HarvestService.harvestAll(testPrisma, discordId)

    expect(result.factories).toHaveLength(1)
    const summary = result.factories[0]!
    expect(summary.ticks).toBe(1)
    expect(summary.produced.GRAIN).toBe(30n)

    const grain = await testPrisma.warehouseStack.findFirst({
      where: { warehouse: { userId: discordId }, material: 'GRAIN' }
    })
    expect(grain?.count).toBe(985n)

    const after = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factory.id }
    })
    expect(after.lastHarvestAt.getTime() - thirtyMinAgo.getTime()).toBe(
      1 * TICK_MS
    )
  })

  it('awards XP and updates user.xp/level after harvest', async () => {
    const discordId = 'harvest-xp-001'
    const thirtyMinAgo = new Date(Date.now() - THIRTY_MIN_MS)

    const { land } = await seedBase({ discordId })
    await placeFactory({
      userId: discordId,
      landId: land.id,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0,
      lastHarvestAt: thirtyMinAgo
    })

    const result = await HarvestService.harvestAll(testPrisma, discordId)

    const expectedXp = xpForEvent({ kind: 'TICK_PRODUCTION', ticks: 3 })
    expect(result.xpGained).toBe(expectedXp)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: discordId }
    })
    // Level 1 requires 100 XP; produced 15 XP → no level-up.
    expect(user.level).toBe(1)
    expect(user.xp).toBe(expectedXp)
    expect(result.newLevel).toBe(1)
    expect(result.leveledUp).toBe(false)
  })
})
