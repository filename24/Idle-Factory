/**
 * `MarketSellService` 통합 테스트 (전용 idle_i15-dev DB).
 *
 * 검증 축 (GitHub #15 U-3):
 *  - 체결 원자성: 창고 차감 · currentPrice×qty 지급 · recentSales 누적 ·
 *    TradeLog(toUserId=null·price>0) · 판매 XP(+20, 감쇠 없음)
 *  - 퀘스트 Q3(MARKET_LISTED) 진행 — 1인 서버 완주 경로
 *  - 검증 실패 시 전체 롤백 (INVALID_QUANTITY / INSUFFICIENT_MATERIAL /
 *    PRICE_NOT_FOUND / USER_NOT_FOUND)
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { MaterialType } from '@idle/game-core'
import { MarketSellService } from '../../src/services/marketSell'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUserWithMaterial(
  id: string,
  material: MaterialType,
  count: bigint
) {
  await UserService.ensure(testPrisma, { discordId: id })
  // 신규 유저 지원금(STARTER_MONEY)을 0 으로 리셋 — 지급액 단언을 절대값으로.
  await testPrisma.user.update({ where: { id }, data: { money: 0n } })
  const wh = await testPrisma.warehouse.findUniqueOrThrow({
    where: { userId: id }
  })
  await testPrisma.warehouseStack.create({
    data: { warehouseId: wh.id, material, count }
  })
  return wh
}

async function seedPrice(
  material: MaterialType,
  basePrice: bigint,
  currentPrice = basePrice
) {
  await testPrisma.globalMarketPrice.create({
    data: { material, basePrice, currentPrice }
  })
}

describe('MarketSellService.sellToGlobal', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects quantity < 1', async () => {
    await seedUserWithMaterial('u-sq', 'GRAIN', 10n)
    await seedPrice('GRAIN', 10n)
    await expect(
      MarketSellService.sellToGlobal(testPrisma, {
        userId: 'u-sq',
        material: 'GRAIN',
        quantity: 0n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_QUANTITY' })
  })

  it('rejects unknown user', async () => {
    await seedPrice('GRAIN', 10n)
    await expect(
      MarketSellService.sellToGlobal(testPrisma, {
        userId: 'u-ghost',
        material: 'GRAIN',
        quantity: 1n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'USER_NOT_FOUND' })
  })

  it('throws INSUFFICIENT_MATERIAL and rolls back when stock is short', async () => {
    await seedUserWithMaterial('u-low', 'GRAIN', 3n)
    await seedPrice('GRAIN', 10n)

    await expect(
      MarketSellService.sellToGlobal(testPrisma, {
        userId: 'u-low',
        material: 'GRAIN',
        quantity: 5n
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MATERIAL'
    })

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-low' }
    })
    expect(user.money).toBe(0n)
    expect(await testPrisma.tradeLog.count()).toBe(0)
  })

  it('throws PRICE_NOT_FOUND when the material has no global price row', async () => {
    await seedUserWithMaterial('u-np', 'GRAIN', 10n)

    await expect(
      MarketSellService.sellToGlobal(testPrisma, {
        userId: 'u-np',
        material: 'GRAIN',
        quantity: 1n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'PRICE_NOT_FOUND' })
  })

  it('체결: 창고 차감 + currentPrice×qty 지급 + recentSales 누적 + TradeLog + XP', async () => {
    await seedUserWithMaterial('u-sell', 'GRAIN', 100n)
    await seedPrice('GRAIN', 10n, 12n) // 기준가 10, 현재가 12 — 체결가는 현재가

    const result = await MarketSellService.sellToGlobal(testPrisma, {
      userId: 'u-sell',
      material: 'GRAIN',
      quantity: 30n
    })

    // 결과 필드 — 판매가 = 현재가 ×100%, 수수료 0 (#15 U-3).
    expect(result.unitPrice).toBe(12n)
    expect(result.totalPaid).toBe(360n)
    expect(result.xpAwarded).toBe(20n) // docs/design/09-level-xp.md '마켓 판매 +20'
    expect(result.leveledUp).toBe(false)

    // 창고 차감.
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-sell' }
    })
    const stack = await testPrisma.warehouseStack.findUniqueOrThrow({
      where: { warehouseId_material: { warehouseId: wh.id, material: 'GRAIN' } }
    })
    expect(stack.count).toBe(70n)

    // 대금 + XP 지급.
    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-sell' }
    })
    expect(user.money).toBe(360n)
    expect(user.xp).toBe(20n)
    expect(user.level).toBe(1)

    // 가격 하방/상방 압력 입력 — 다음 tick 의 demandFactor 재료.
    const price = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'GRAIN' }
    })
    expect(price.recentSales).toBe(30)
    expect(price.currentPrice).toBe(12n) // 체결이 즉시 가격을 바꾸지 않는다

    // TradeLog 규약: 글로벌 판매 = toUserId=null · price>0 (회수 price=0 과 구분).
    const logs = await testPrisma.tradeLog.findMany()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({
      fromUserId: 'u-sell',
      toUserId: null,
      kind: 'MARKET_SELL',
      material: 'GRAIN',
      amount: 30n,
      price: 360n,
      guildId: null
    })
  })

  it('미시드 guildId 는 FK 가드로 null 로 낮춰 기록한다', async () => {
    await seedUserWithMaterial('u-gid', 'ORE', 5n)
    await seedPrice('ORE', 20n)

    await MarketSellService.sellToGlobal(testPrisma, {
      userId: 'u-gid',
      material: 'ORE',
      quantity: 5n,
      guildId: '999999999999999999' // DB 에 없는 서버
    })

    const log = await testPrisma.tradeLog.findFirstOrThrow()
    expect(log.guildId).toBeNull()
  })

  it('반복 판매에도 XP 감쇠가 없다 (상대 없음 — 건당 +20 고정)', async () => {
    await seedUserWithMaterial('u-rep', 'GRAIN', 10n)
    await seedPrice('GRAIN', 10n)

    for (let i = 0; i < 3; i++) {
      const r = await MarketSellService.sellToGlobal(testPrisma, {
        userId: 'u-rep',
        material: 'GRAIN',
        quantity: 1n
      })
      expect(r.xpAwarded).toBe(20n)
    }

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-rep' }
    })
    expect(user.xp).toBe(60n)

    const price = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'GRAIN' }
    })
    expect(price.recentSales).toBe(3)
  })

  it('tutorial.3 (MARKET_LISTED) 를 글로벌 판매로도 완료할 수 있다 — 1인 서버 경로', async () => {
    await seedUserWithMaterial('u-q3', 'GRAIN', 10n)
    await seedPrice('GRAIN', 10n)
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

    const result = await MarketSellService.sellToGlobal(testPrisma, {
      userId: 'u-q3',
      material: 'GRAIN',
      quantity: 1n
    })

    expect(result.quest.newlyCompleted.map((q) => q.questId)).toContain(
      'tutorial.3'
    )
    const t3 = await testPrisma.userQuest.findFirstOrThrow({
      where: { userId: 'u-q3', questId: 'tutorial.3' }
    })
    expect(t3.status).toBe('COMPLETED')
  })
})

describe('MarketSellService.listSellableStacks', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('보유량 0 초과 + 허용 자재만 반환한다', async () => {
    await seedUserWithMaterial('u-ls', 'GRAIN', 10n)
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-ls' }
    })
    await testPrisma.warehouseStack.create({
      data: { warehouseId: wh.id, material: 'ORE', count: 0n }
    })
    await testPrisma.warehouseStack.create({
      data: { warehouseId: wh.id, material: 'RAW_BOOSTER', count: 5n }
    })

    const stacks = await MarketSellService.listSellableStacks(
      testPrisma,
      'u-ls',
      ['GRAIN', 'ORE', 'WOOD'] // RAW_BOOSTER 는 판매 허용 집합 밖
    )

    expect(stacks).toEqual([{ material: 'GRAIN', count: 10n }])
  })

  it('창고가 없으면 빈 배열', async () => {
    const stacks = await MarketSellService.listSellableStacks(
      testPrisma,
      'u-none',
      ['GRAIN']
    )
    expect(stacks).toEqual([])
  })
})
