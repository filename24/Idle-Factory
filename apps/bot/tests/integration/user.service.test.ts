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

  // 과거에는 ensure 가 가입 시점 interaction.locale 을 lang 에 박아넣었다.
  // 그러면 모든 유저가 개인 언어를 "고른" 상태가 되어 서버 언어 설정이 아무에게도
  // 적용되지 않는다. 이제 개인 언어는 /language 로만 설정한다.
  it("seeds lang as 'auto' so the guild setting still applies", async () => {
    const discordId = '100000000000000004'

    const hydrated = await UserService.ensure(testPrisma, { discordId })

    expect(hydrated.lang).toBe('auto')

    const fromDb = await testPrisma.user.findUniqueOrThrow({
      where: { id: discordId },
      select: { lang: true }
    })
    expect(fromDb.lang).toBe('auto')
  })
})

describe('UserService.updateLang', () => {
  beforeAll(async () => {
    await resetDb()
  })

  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('persists an explicit personal language choice', async () => {
    const discordId = '100000000000000005'
    await UserService.ensure(testPrisma, { discordId })

    const updated = await UserService.updateLang(testPrisma, discordId, 'en-US')

    expect(updated.lang).toBe('en-US')

    const fromDb = await testPrisma.user.findUniqueOrThrow({
      where: { id: discordId },
      select: { lang: true }
    })
    expect(fromDb.lang).toBe('en-US')
  })

  it("can be reset to 'auto' to follow the guild setting again", async () => {
    const discordId = '100000000000000006'
    await UserService.ensure(testPrisma, { discordId })
    await UserService.updateLang(testPrisma, discordId, 'en-US')

    const reset = await UserService.updateLang(testPrisma, discordId, 'auto')

    expect(reset.lang).toBe('auto')
  })

  it('rejects a locale with no translation resources', async () => {
    const discordId = '100000000000000007'
    await UserService.ensure(testPrisma, { discordId })

    await expect(
      UserService.updateLang(testPrisma, discordId, 'fr')
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_LANGUAGE' })

    const fromDb = await testPrisma.user.findUniqueOrThrow({
      where: { id: discordId },
      select: { lang: true }
    })
    expect(fromDb.lang).toBe('auto')
  })
})
