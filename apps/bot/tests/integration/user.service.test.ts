import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

const SPECIAL_TYPES = ['ORE', 'FERTILE', 'FOREST', 'OIL', 'WATER'] as const
const MAX_PER_SPECIAL_TYPE = 2

describe('UserService.ensure', () => {
  beforeAll(async () => {
    await resetDb()
  })

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('creates a fresh user with a 4×4 land and a grade-1 warehouse', async () => {
    const discordId = '100000000000000001'

    const hydrated = await UserService.ensure(testPrisma, {
      discordId,
      nickname: 'alice'
    })

    expect(hydrated.id).toBe(discordId)
    expect(hydrated.nickname).toBe('alice')

    const starterLand = hydrated.lands[0]
    expect(starterLand).toBeDefined()
    expect(starterLand?.index).toBe(1)
    expect(starterLand?.width).toBe(4)
    expect(starterLand?.height).toBe(4)
    expect(starterLand?.slots).toHaveLength(16)

    expect(hydrated.warehouse).not.toBeNull()
    expect(hydrated.warehouse?.grade).toBe(1)

    const landCount = await testPrisma.land.count({
      where: { userId: discordId }
    })
    const warehouseCount = await testPrisma.warehouse.count({
      where: { userId: discordId }
    })
    const slotCount = await testPrisma.slot.count({
      where: { land: { userId: discordId } }
    })
    expect(landCount).toBe(1)
    expect(warehouseCount).toBe(1)
    expect(slotCount).toBe(16)
  })

  it('is idempotent — calling ensure() twice does not create duplicates', async () => {
    const discordId = '100000000000000002'

    const first = await UserService.ensure(testPrisma, { discordId })
    const second = await UserService.ensure(testPrisma, { discordId })

    expect(second.id).toBe(first.id)
    expect(second.lands[0]?.id).toBe(first.lands[0]?.id)
    expect(second.warehouse?.id).toBe(first.warehouse?.id)

    expect(await testPrisma.user.count({ where: { id: discordId } })).toBe(1)
    expect(await testPrisma.land.count({ where: { userId: discordId } })).toBe(
      1
    )
    expect(
      await testPrisma.warehouse.count({ where: { userId: discordId } })
    ).toBe(1)
    expect(
      await testPrisma.slot.count({ where: { land: { userId: discordId } } })
    ).toBe(16)
  })

  it('generates 16 slots with x∈[0..3], y∈[0..3] and at most 2 per special type', async () => {
    const discordId = '100000000000000003'

    const hydrated = await UserService.ensure(testPrisma, { discordId })
    const slots = hydrated.lands[0]?.slots ?? []

    expect(slots).toHaveLength(16)

    const coords = new Set<string>()
    for (const slot of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(0)
      expect(slot.x).toBeLessThanOrEqual(3)
      expect(slot.y).toBeGreaterThanOrEqual(0)
      expect(slot.y).toBeLessThanOrEqual(3)
      coords.add(`${slot.x},${slot.y}`)
    }
    expect(coords.size).toBe(16)

    for (const type of SPECIAL_TYPES) {
      const count = slots.filter((s) => s.type === type).length
      expect(count).toBeLessThanOrEqual(MAX_PER_SPECIAL_TYPE)
    }
  })

  it('persists the lang field when passed', async () => {
    const discordId = '100000000000000004'

    const hydrated = await UserService.ensure(testPrisma, {
      discordId,
      lang: 'en'
    })

    expect(hydrated.lang).toBe('en')

    const fromDb = await testPrisma.user.findUniqueOrThrow({
      where: { id: discordId },
      select: { lang: true }
    })
    expect(fromDb.lang).toBe('en')
  })
})
