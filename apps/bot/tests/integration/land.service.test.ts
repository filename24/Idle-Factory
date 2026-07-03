import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FactoryTier, FactoryType } from '@idle/database'
import { moveCost } from '@idle/game-core'
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

// 파일 전역 훅 — 여러 describe 가 공유 `testPrisma` 싱글턴을 쓰므로 닫기는 파일당 1회만.
beforeEach(async () => {
  await resetDb()
})
afterAll(async () => {
  await closeDb()
})

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

/** 대상 유저의 landIndex 토지 id 를 반환한다. */
async function landId(index: number): Promise<string> {
  const land = await testPrisma.land.findUniqueOrThrow({
    where: { userId_index: { userId: USER_ID, index } }
  })
  return land.id
}

/** 토지의 잠긴 슬롯을 전부 해제해 4×4 전체를 활성화한다 (T3 이동 테스트용 공간 확보). */
async function unlockLand(index: number): Promise<void> {
  const id = await landId(index)
  await testPrisma.slot.updateMany({
    where: { landId: id },
    data: { locked: false }
  })
}

/**
 * 게이팅(레벨·자금·자재) 없이 공장을 직접 배치한다.
 *
 * 이동 로직만 격리 검증하기 위한 테스트 헬퍼 — Factory 행 생성 + 점유 슬롯 factoryId 세팅.
 * 반환값은 생성된 factoryId.
 */
async function placeFactory(opts: {
  landIdValue: string
  type: FactoryType
  tier: FactoryTier
  anchorX: number
  anchorY: number
  width?: number
  height?: number
  grade?: number
  lastHarvestAt?: Date
}): Promise<string> {
  const {
    landIdValue,
    type,
    tier,
    anchorX,
    anchorY,
    width = 1,
    height = 1,
    grade = 1,
    lastHarvestAt
  } = opts
  const factory = await testPrisma.factory.create({
    data: {
      userId: USER_ID,
      landId: landIdValue,
      type,
      tier,
      grade,
      anchorX,
      anchorY,
      width,
      height,
      ...(lastHarvestAt ? { lastHarvestAt } : {})
    }
  })
  const cells: Array<{ x: number; y: number }> = []
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: anchorX + dx, y: anchorY + dy })
    }
  }
  await testPrisma.slot.updateMany({
    where: { landId: landIdValue, OR: cells },
    data: { factoryId: factory.id }
  })
  return factory.id
}

/** 특정 슬롯의 factoryId 를 조회한다. */
async function slotFactoryId(
  landIdValue: string,
  x: number,
  y: number
): Promise<string | null> {
  const slot = await testPrisma.slot.findFirstOrThrow({
    where: { landId: landIdValue, x, y }
  })
  return slot.factoryId
}

describe('LandService.buy', () => {
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

describe('LandService.buy — multi-zone scenarios', () => {
  it('sequentially buys lands 2→5, each a fresh 4×4 with 16 slots', async () => {
    // 1M + 10M + 100M + 1B = 1.111B 필요.
    await seedUser(2_000_000_000n)

    let total = 1
    for (let idx = MIN_BUYABLE_INDEX; idx <= MAX_BUYABLE_INDEX; idx += 1) {
      const res = await LandService.buy(testPrisma, {
        userId: USER_ID,
        targetIndex: idx
      })
      total += 1
      expect(res.targetIndex).toBe(idx)
      expect(res.cost).toBe(landCost(idx))
      expect(res.totalLands).toBe(total)
    }

    const lands = await testPrisma.land.findMany({
      where: { userId: USER_ID },
      include: { slots: true },
      orderBy: { index: 'asc' }
    })
    expect(lands.map((l) => l.index)).toEqual([1, 2, 3, 4, 5])
    for (const l of lands) expect(l.slots).toHaveLength(16)
  })

  it('applies the "max 2 special slots per type" rule independently per land', async () => {
    await seedUser(2_000_000_000n)
    for (let idx = MIN_BUYABLE_INDEX; idx <= MAX_BUYABLE_INDEX; idx += 1) {
      await LandService.buy(testPrisma, { userId: USER_ID, targetIndex: idx })
    }

    const lands = await testPrisma.land.findMany({
      where: { userId: USER_ID },
      include: { slots: true }
    })
    expect(lands).toHaveLength(5)

    // docs/11-land.md §특수 슬롯 생성 규칙: 한 토지에 같은 종류 특수 슬롯 최대 2개.
    // 각 토지는 독립 재추첨되므로 토지별로 개별 검증한다.
    for (const land of lands) {
      const counts = new Map<string, number>()
      for (const s of land.slots) {
        if (s.type === 'NORMAL') continue
        counts.set(s.type, (counts.get(s.type) ?? 0) + 1)
      }
      for (const [, c] of counts) {
        expect(c).toBeLessThanOrEqual(2)
      }
    }
  })
})

describe('LandService.moveFactory', () => {
  it('moves a FARM to an empty cell: debits 25% cost, relocates slot, preserves grade & lastHarvestAt', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1)
    const harvestAt = new Date('2026-01-01T00:00:00.000Z')
    const factoryId = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0,
      grade: 4,
      lastHarvestAt: harvestAt
    })

    const result = await LandService.moveFactory(testPrisma, {
      userId: USER_ID,
      landIndex: 1,
      factoryId,
      toX: 2,
      toY: 2
    })

    // 이동 비용 = 신축비의 25% (docs/11-land.md §공장 이동). FARM: 1000 → 250.
    expect(result.cost).toBe(moveCost('FARM'))
    expect(result.fromX).toBe(0)
    expect(result.fromY).toBe(0)
    expect(result.toX).toBe(2)
    expect(result.toY).toBe(2)
    expect(result.remainingMoney).toBe(1_000_000n - moveCost('FARM'))

    const factory = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factoryId }
    })
    expect(factory.anchorX).toBe(2)
    expect(factory.anchorY).toBe(2)
    expect(factory.grade).toBe(4) // 등급 유지
    // 생산 연속성 — lastHarvestAt 유지 (tick 누적 초기화 방지).
    expect(factory.lastHarvestAt.getTime()).toBe(harvestAt.getTime())

    expect(await slotFactoryId(land1, 0, 0)).toBeNull() // 기존 셀 해제
    expect(await slotFactoryId(land1, 2, 2)).toBe(factoryId) // 목적지 점유

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER_ID }
    })
    expect(user.money).toBe(1_000_000n - moveCost('FARM'))
  })

  it('throws INSUFFICIENT_MONEY and leaves position & money unchanged', async () => {
    await seedUser(100n) // < 250
    const land1 = await landId(1)
    const factoryId = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0
    })

    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId,
        toX: 1,
        toY: 1
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY'
    })

    const factory = await testPrisma.factory.findUniqueOrThrow({
      where: { id: factoryId }
    })
    expect(factory.anchorX).toBe(0)
    expect(factory.anchorY).toBe(0)
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER_ID }
    })
    expect(user.money).toBe(100n)
    expect(await slotFactoryId(land1, 0, 0)).toBe(factoryId)
  })

  it('throws SLOT_OCCUPIED when destination holds another factory (no charge)', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1)
    const farm = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0
    })
    await placeFactory({
      landIdValue: land1,
      type: 'MINE',
      tier: 'T1',
      anchorX: 1,
      anchorY: 1
    })

    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId: farm,
        toX: 1,
        toY: 1
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'SLOT_OCCUPIED' })

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: USER_ID }
    })
    expect(user.money).toBe(1_000_000n) // 실패 시 미차감
  })

  it('moves a T3 (2×2) factory, relocating all four occupied slots', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1)
    await unlockLand(1) // 4×4 전체 활성화로 이동 공간 확보
    const car = await placeFactory({
      landIdValue: land1,
      type: 'CAR_FACTORY',
      tier: 'T3',
      anchorX: 0,
      anchorY: 0,
      width: 2,
      height: 2
    })

    const result = await LandService.moveFactory(testPrisma, {
      userId: USER_ID,
      landIndex: 1,
      factoryId: car,
      toX: 2,
      toY: 2
    })
    // CAR_FACTORY: 100000 → 25% = 25000.
    expect(result.cost).toBe(moveCost('CAR_FACTORY'))

    const factory = await testPrisma.factory.findUniqueOrThrow({
      where: { id: car }
    })
    expect([factory.anchorX, factory.anchorY]).toEqual([2, 2])

    // 기존 4셀 해제
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1]
    ] as const) {
      expect(await slotFactoryId(land1, x, y)).toBeNull()
    }
    // 목적지 4셀 점유
    for (const [x, y] of [
      [2, 2],
      [3, 2],
      [2, 3],
      [3, 3]
    ] as const) {
      expect(await slotFactoryId(land1, x, y)).toBe(car)
    }
  })

  it('rejects moving a non-factory / warehouse target with FACTORY_NOT_FOUND', async () => {
    // 창고(Warehouse)는 Factory 행이 아니므로 이동 대상이 될 수 없다 — 존재하지 않는 id 로 검증.
    await seedUser(1_000_000n)
    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId: 'not-a-factory-id',
        toX: 1,
        toY: 1
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'FACTORY_NOT_FOUND' })
  })

  it('throws MOVE_SAME_POSITION when destination equals current anchor', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1)
    const farm = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 1,
      anchorY: 1
    })
    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId: farm,
        toX: 1,
        toY: 1
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'MOVE_SAME_POSITION'
    })
  })

  it('throws SLOT_LOCKED when destination is a locked slot', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1) // starter land: (3,3) is locked
    const farm = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0
    })
    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId: farm,
        toX: 3,
        toY: 3
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'SLOT_LOCKED' })
  })

  it('throws OUT_OF_BOUNDS when a T3 would overflow the grid edge', async () => {
    await seedUser(1_000_000n)
    const land1 = await landId(1)
    await unlockLand(1)
    const car = await placeFactory({
      landIdValue: land1,
      type: 'CAR_FACTORY',
      tier: 'T3',
      anchorX: 0,
      anchorY: 0,
      width: 2,
      height: 2
    })
    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 1,
        factoryId: car,
        toX: 3,
        toY: 3
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'OUT_OF_BOUNDS' })
  })

  it('blocks cross-zone move (factory on land 1, landIndex 2) with FACTORY_NOT_FOUND', async () => {
    await seedUser(2_000_000n)
    await LandService.buy(testPrisma, { userId: USER_ID, targetIndex: 2 })
    const land1 = await landId(1)
    const farm = await placeFactory({
      landIdValue: land1,
      type: 'FARM',
      tier: 'T1',
      anchorX: 0,
      anchorY: 0
    })
    // 구역 간 이동 불가 (docs/11-land.md §공장 이동) — land 2 로 이동 시도는 거부된다.
    await expect(
      LandService.moveFactory(testPrisma, {
        userId: USER_ID,
        landIndex: 2,
        factoryId: farm,
        toX: 0,
        toY: 0
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'FACTORY_NOT_FOUND' })
  })
})
