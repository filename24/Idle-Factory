/**
 * `DirectBuyService` 통합 테스트 (전용 idle_i16-dev DB).
 *
 * 검증 축 (GitHub #16, docs/design/04-economy.md §자재 직구매):
 *  - 정상 체결: ×2 할증 단가 · money 차감 · 창고 입고 · DailyPurchase 소진 ·
 *    recentSales 누적 · TradeLog(kind=DIRECT_BUY, from=null·to=구매자) · XP 없음
 *  - 일일 한도: 레벨 구간 한도 소진·초과 거부·KST 자정 리셋 경계
 *  - 차단: T3·RAW_BOOSTER (MATERIAL_NOT_DIRECT_BUYABLE)
 *  - 용량 정책: 창고 용량 초과 상태에서도 입고 성공 (market buy 와 동일 무검사)
 *  - 검증 실패 시 전체 롤백 (INSUFFICIENT_MONEY 등)
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { MaterialType } from '@idle/game-core'
import { DirectBuyService } from '../../src/services/directBuy'
import { UserService } from '../../src/services/user'
import { closeDb, resetDb, testPrisma } from './setup'

/** KST 2026-07-03 23:59 — 자정 직전. */
const LATE_NIGHT_KST = new Date('2026-07-03T14:59:00Z')
/** KST 2026-07-04 00:00 — 다음 날 자정 (리셋 경계). */
const NEXT_MIDNIGHT_KST = new Date('2026-07-03T15:00:00Z')

async function seedUser(id: string, money: bigint, level = 1) {
  await UserService.ensure(testPrisma, { discordId: id })
  await testPrisma.user.update({ where: { id }, data: { money, level } })
}

async function seedPrice(
  material: MaterialType,
  currentPrice: bigint,
  basePrice = currentPrice
) {
  await testPrisma.globalMarketPrice.create({
    data: { material, basePrice, currentPrice }
  })
}

async function stackCount(userId: string, material: MaterialType) {
  const wh = await testPrisma.warehouse.findUniqueOrThrow({
    where: { userId }
  })
  const stack = await testPrisma.warehouseStack.findUnique({
    where: { warehouseId_material: { warehouseId: wh.id, material } }
  })
  return stack?.count ?? 0n
}

describe('DirectBuyService.buy', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects quantity < 1', async () => {
    await seedUser('u-q', 1_000n)
    await seedPrice('GRAIN', 10n)
    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-q',
        material: 'GRAIN',
        quantity: 0n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'INVALID_QUANTITY' })
  })

  it.each<MaterialType>(['CAR', 'ELECTRONIC', 'FINISHED_FOOD', 'RAW_BOOSTER'])(
    'T3·RAW_BOOSTER 차단: %s',
    async (material) => {
      await seedUser('u-t3', 1_000_000n)
      await expect(
        DirectBuyService.buy(testPrisma, {
          userId: 'u-t3',
          material,
          quantity: 1n
        })
      ).rejects.toMatchObject({
        name: 'ServiceError',
        code: 'MATERIAL_NOT_DIRECT_BUYABLE'
      })
    }
  )

  it('rejects unknown user', async () => {
    await seedPrice('GRAIN', 10n)
    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-ghost',
        material: 'GRAIN',
        quantity: 1n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'USER_NOT_FOUND' })
  })

  it('throws PRICE_NOT_FOUND when the material has no global price row', async () => {
    await seedUser('u-np', 1_000n)
    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-np',
        material: 'GRAIN',
        quantity: 1n
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'PRICE_NOT_FOUND' })
  })

  it('체결: ×2 단가 차감 + 창고 입고 + 한도 소진 + recentSales + TradeLog(DIRECT_BUY) + XP 없음', async () => {
    await seedUser('u-buy', 10_000n, 1)
    await seedPrice('GRAIN', 10n, 8n) // 현재가 10 — 직구매 단가 20

    const result = await DirectBuyService.buy(testPrisma, {
      userId: 'u-buy',
      material: 'GRAIN',
      quantity: 30n,
      guildId: null,
      now: LATE_NIGHT_KST
    })

    expect(result.unitPrice).toBe(20n) // currentPrice ×2 (기준가 아님)
    expect(result.totalCost).toBe(600n)
    expect(result.dailyLimit).toBe(100) // Lv.1 → 100 (04 테이블)
    expect(result.dailyUsed).toBe(30)
    expect(result.dailyRemaining).toBe(70)
    expect(result.resetsAt.toISOString()).toBe('2026-07-03T15:00:00.000Z')

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-buy' }
    })
    expect(user.money).toBe(10_000n - 600n)
    // 구매 행위는 XP 미지급 (docs/design/09-level-xp.md).
    expect(user.xp).toBe(0n)
    expect(user.level).toBe(1)

    expect(await stackCount('u-buy', 'GRAIN')).toBe(30n)

    const purchase = await testPrisma.dailyPurchase.findFirstOrThrow({
      where: { userId: 'u-buy' }
    })
    expect(purchase.totalBought).toBe(30)
    expect(purchase.date.toISOString()).toBe('2026-07-02T15:00:00.000Z') // KST 7/3 자정

    const price = await testPrisma.globalMarketPrice.findUniqueOrThrow({
      where: { material: 'GRAIN' }
    })
    expect(price.recentSales).toBe(30) // 단일 누적 (부호 분리 없음, #16 확정)

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { kind: 'DIRECT_BUY' }
    })
    expect(log.fromUserId).toBeNull() // 시스템 판매자
    expect(log.toUserId).toBe('u-buy') // 구매자
    expect(log.material).toBe('GRAIN')
    expect(log.amount).toBe(30n)
    expect(log.price).toBe(600n) // 총액(gross, ×2 반영)
    expect(log.guildId).toBeNull()
  })

  it('전 자재 합산 일일 한도 — 초과 거부 후 정확히 잔량까지 허용', async () => {
    await seedUser('u-limit', 1_000_000n, 1) // Lv.1 → 한도 100
    await seedPrice('GRAIN', 10n)
    await seedPrice('ORE', 10n)

    await DirectBuyService.buy(testPrisma, {
      userId: 'u-limit',
      material: 'GRAIN',
      quantity: 60n,
      now: LATE_NIGHT_KST
    })

    // 다른 자재라도 합산 한도에 걸린다 (04 — "곡물 50 + 광석 50 = 100").
    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-limit',
        material: 'ORE',
        quantity: 41n,
        now: LATE_NIGHT_KST
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'DAILY_LIMIT_EXCEEDED',
      details: { limit: 100, used: 60, remaining: 40 }
    })

    // 잔량(40)은 성공하고 한도가 0 이 된다.
    const result = await DirectBuyService.buy(testPrisma, {
      userId: 'u-limit',
      material: 'ORE',
      quantity: 40n,
      now: LATE_NIGHT_KST
    })
    expect(result.dailyUsed).toBe(100)
    expect(result.dailyRemaining).toBe(0)

    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-limit',
        material: 'GRAIN',
        quantity: 1n,
        now: LATE_NIGHT_KST
      })
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' })
  })

  it('KST 자정 경계에서 한도가 리셋된다 (일자 키 분리)', async () => {
    await seedUser('u-kst', 1_000_000n, 1)
    await seedPrice('GRAIN', 10n)

    await DirectBuyService.buy(testPrisma, {
      userId: 'u-kst',
      material: 'GRAIN',
      quantity: 100n,
      now: LATE_NIGHT_KST
    })
    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-kst',
        material: 'GRAIN',
        quantity: 1n,
        now: LATE_NIGHT_KST
      })
    ).rejects.toMatchObject({ code: 'DAILY_LIMIT_EXCEEDED' })

    // 1분 뒤 = KST 다음 날 00:00 — 새 일자 키로 전체 한도가 살아난다.
    const result = await DirectBuyService.buy(testPrisma, {
      userId: 'u-kst',
      material: 'GRAIN',
      quantity: 100n,
      now: NEXT_MIDNIGHT_KST
    })
    expect(result.dailyUsed).toBe(100)

    const rows = await testPrisma.dailyPurchase.findMany({
      where: { userId: 'u-kst' },
      orderBy: { date: 'asc' }
    })
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.totalBought)).toEqual([100, 100])
  })

  it('레벨 구간별 한도 적용 — Lv.31+ 는 10,000', async () => {
    await seedUser('u-l31', 10_000_000n, 31)
    await seedPrice('STEEL', 100n)

    const result = await DirectBuyService.buy(testPrisma, {
      userId: 'u-l31',
      material: 'STEEL',
      quantity: 5_000n
    })
    expect(result.dailyLimit).toBe(10_000)
    expect(result.dailyRemaining).toBe(5_000)
  })

  it('INSUFFICIENT_MONEY — 전체 롤백 (한도·창고·로그 모두 원복)', async () => {
    await seedUser('u-poor', 10n, 1)
    await seedPrice('GRAIN', 10n) // 단가 20 — 1개도 못 산다

    await expect(
      DirectBuyService.buy(testPrisma, {
        userId: 'u-poor',
        material: 'GRAIN',
        quantity: 1n
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY'
    })

    const user = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'u-poor' }
    })
    expect(user.money).toBe(10n)
    expect(await stackCount('u-poor', 'GRAIN')).toBe(0n)
    expect(await testPrisma.dailyPurchase.count()).toBe(0)
    expect(await testPrisma.tradeLog.count()).toBe(0)
  })

  it('창고 용량 정책 — 용량 초과 상태에서도 입고 성공 (market buy 와 동일 무검사)', async () => {
    await seedUser('u-full', 10_000_000n, 31)
    await seedPrice('WOOD', 10n)
    // grade 1 창고 용량(3,000)을 이미 초과한 스택을 만들어 둔다.
    const wh = await testPrisma.warehouse.findUniqueOrThrow({
      where: { userId: 'u-full' }
    })
    await testPrisma.warehouseStack.create({
      data: { warehouseId: wh.id, material: 'WOOD', count: 100_000n }
    })

    const result = await DirectBuyService.buy(testPrisma, {
      userId: 'u-full',
      material: 'WOOD',
      quantity: 500n
    })
    expect(result.totalCost).toBe(10_000n)
    expect(await stackCount('u-full', 'WOOD')).toBe(100_500n)
  })

  it('guildId 가 실존 서버면 TradeLog 에 귀속, 미등록이면 null 로 강등', async () => {
    await seedUser('u-guild', 100_000n, 1)
    await seedPrice('GRAIN', 10n)
    await testPrisma.guild.create({ data: { id: 'g-real', name: 'Real' } })

    await DirectBuyService.buy(testPrisma, {
      userId: 'u-guild',
      material: 'GRAIN',
      quantity: 1n,
      guildId: 'g-real'
    })
    await DirectBuyService.buy(testPrisma, {
      userId: 'u-guild',
      material: 'GRAIN',
      quantity: 1n,
      guildId: 'g-ghost'
    })

    const logs = await testPrisma.tradeLog.findMany({
      where: { kind: 'DIRECT_BUY' },
      orderBy: { createdAt: 'asc' }
    })
    expect(logs.map((l) => l.guildId)).toEqual(['g-real', null])
  })
})

describe('DirectBuyService.getDailyUsage', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('사용 전 전체 한도, 구매 후 잔량·리셋 시각을 돌려준다', async () => {
    await seedUser('u-usage', 100_000n, 6) // Lv.6 → 500
    await seedPrice('FUEL', 5n)

    const before = await DirectBuyService.getDailyUsage(
      testPrisma,
      'u-usage',
      LATE_NIGHT_KST
    )
    expect(before).toMatchObject({ limit: 500, used: 0, remaining: 500 })

    await DirectBuyService.buy(testPrisma, {
      userId: 'u-usage',
      material: 'FUEL',
      quantity: 123n,
      now: LATE_NIGHT_KST
    })

    const after = await DirectBuyService.getDailyUsage(
      testPrisma,
      'u-usage',
      LATE_NIGHT_KST
    )
    expect(after).toMatchObject({ limit: 500, used: 123, remaining: 377 })
    expect(after.resetsAt.toISOString()).toBe('2026-07-03T15:00:00.000Z')
  })

  it('rejects unknown user', async () => {
    await expect(
      DirectBuyService.getDailyUsage(testPrisma, 'u-none')
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'USER_NOT_FOUND' })
  })
})
