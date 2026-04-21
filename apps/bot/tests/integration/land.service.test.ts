import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { ServiceError } from '../../src/services/base'
import {
  LandService,
  MAX_BUYABLE_INDEX,
  MIN_BUYABLE_INDEX,
  landCost
} from '../../src/services/land'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

const USER_ID = 'land-test-user'

async function seedUser(money: bigint): Promise<void> {
  await UserService.ensure(testPrisma, {
    discordId: USER_ID,
    nickname: 'land-test'
  })
  await testPrisma.user.update({
    where: { id: USER_ID },
    data: { money }
  })
}

describe('LandService.buy', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('purchases the 2nd land: debits cost, creates 4×4 land with 16 slots', async () => {
    await seedUser(1_000_000n)

    const result = await LandService.buy(testPrisma, {
      userId: USER_ID,
      targetIndex: 2
    })

    expect(result.targetIndex).toBe(2)
    expect(result.cost).toBe(1_000_000n)
    expect(result.remainingMoney).toBe(0n)
    expect(result.totalLands).toBe(2)

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER_ID }
    })
    expect(user.money).toBe(0n)

    const land = await testPrisma.land.findUniqueOrThrow({
      where: { userId_index: { userId: USER_ID, index: 2 } },
      include: { slots: true }
    })
    expect(land.width).toBe(4)
    expect(land.height).toBe(4)
    expect(land.slots).toHaveLength(16)
  })

  it('landCost follows 1,000,000 × 10^(N-2) formula', () => {
    expect(landCost(2)).toBe(1_000_000n)
    expect(landCost(3)).toBe(10_000_000n)
    expect(landCost(4)).toBe(100_000_000n)
    expect(landCost(5)).toBe(1_000_000_000n)
  })

  it('throws MAX_LANDS when user already owns 5 lands', async () => {
    await seedUser(10_000_000_000n)
    for (let i = MIN_BUYABLE_INDEX; i <= MAX_BUYABLE_INDEX; i += 1) {
      await LandService.buy(testPrisma, { userId: USER_ID, targetIndex: i })
    }

    const err = await LandService.buy(testPrisma, {
      userId: USER_ID,
      targetIndex: 2
    }).catch((e) => e)

    expect(err).toBeInstanceOf(ServiceError)
    expect((err as ServiceError).code).toBe('MAX_LANDS')
  })

  it('throws INVALID_LAND_INDEX when targetIndex is out of range', async () => {
    await seedUser(10_000_000_000n)

    await expect(
      LandService.buy(testPrisma, { userId: USER_ID, targetIndex: 1 })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INVALID_LAND_INDEX'
    })

    await expect(
      LandService.buy(testPrisma, { userId: USER_ID, targetIndex: 6 })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INVALID_LAND_INDEX'
    })
  })

  it('throws INVALID_LAND_INDEX when target breaks index continuity', async () => {
    await seedUser(10_000_000_000n)

    await expect(
      LandService.buy(testPrisma, { userId: USER_ID, targetIndex: 3 })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INVALID_LAND_INDEX'
    })

    const count = await testPrisma.land.count({ where: { userId: USER_ID } })
    expect(count).toBe(1)
  })

  it('throws INSUFFICIENT_MONEY and leaves state unchanged', async () => {
    await seedUser(100n)

    await expect(
      LandService.buy(testPrisma, { userId: USER_ID, targetIndex: 2 })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY'
    })

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER_ID }
    })
    expect(user.money).toBe(100n)

    const count = await testPrisma.land.count({ where: { userId: USER_ID } })
    expect(count).toBe(1)
  })
})
