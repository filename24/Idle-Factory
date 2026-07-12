/**
 * `StockPriceService` 통합 테스트 (전용 *-dev DB).
 *
 * 검증 축 (GitHub #18, D9·D10):
 *  - 수급·수익 신호가 없으면 가격 유지 + tick 기록·lastTickAt 갱신
 *  - 최근 1시간 매수 수급 → demandPressure 반영 (1만분율 정수 산술)
 *  - 서킷브레이커: 당일 첫 tick 가격 기준 ±30% clamp (D10),
 *    당일 tick 이 없으면 직전 종가(currentPrice) 기준 — 전일 상승분이
 *    자정 후에도 유지된다(ipoPrice 폴백 결함 회귀 방지)
 */

import { kstDayStart } from '@idle/game-core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { StockPriceService } from '../../src/services/stockPrice'
import { closeDb, resetDb, testPrisma } from './setup'

/** 상장 종목 시드 — 발행자·토지·공장 포함. */
async function seedStock(params: {
  issuerId: string
  currentPrice: bigint
  ipoPrice?: bigint
}) {
  await testPrisma.user.create({
    data: {
      id: params.issuerId,
      nickname: `tick-${params.issuerId}`,
      level: 30
    }
  })
  const land = await testPrisma.land.create({
    data: { userId: params.issuerId, index: 1, width: 4, height: 4 }
  })
  const factory = await testPrisma.factory.create({
    data: {
      userId: params.issuerId,
      landId: land.id,
      type: 'FARM',
      tier: 'T1',
      grade: 1,
      anchorX: 0,
      anchorY: 0,
      width: 1,
      height: 1,
      lastHarvestAt: new Date()
    }
  })
  return testPrisma.stock.create({
    data: {
      factoryId: factory.id,
      market: 'SERVER',
      ipoPrice: params.ipoPrice ?? params.currentPrice,
      currentPrice: params.currentPrice
    }
  })
}

describe('StockPriceService.priceTick', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('is a no-op result when no stock is listed', async () => {
    const result = await StockPriceService.priceTick(testPrisma)
    expect(result.updatedCount).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('keeps the price flat without volume/profit signals and records a tick', async () => {
    const stock = await seedStock({
      issuerId: 'tick-flat',
      currentPrice: 1_000n
    })
    const now = new Date()

    const result = await StockPriceService.priceTick(testPrisma, { now })

    expect(result.updatedCount).toBe(1)
    expect(result.rows[0]).toMatchObject({
      stockId: stock.id,
      previousPrice: 1_000n,
      currentPrice: 1_000n, // demand=0·profit=0 → 변동 없음 (U-5 가드)
      dayOpenPrice: 1_000n // 당일 tick 없음 → 직전 종가(currentPrice) (D10)
    })

    const updated = await testPrisma.stock.findUniqueOrThrow({
      where: { id: stock.id }
    })
    expect(updated.currentPrice).toBe(1_000n)
    expect(updated.lastTickAt).toEqual(now)

    const ticks = await testPrisma.stockPriceTick.findMany({
      where: { stockId: stock.id }
    })
    expect(ticks).toHaveLength(1)
    expect(ticks[0].price).toBe(1_000n)
    expect(ticks[0].tickAt).toEqual(now)
  })

  it('applies buy-side demand pressure from the last hour (D9)', async () => {
    const stock = await seedStock({
      issuerId: 'tick-buy',
      currentPrice: 1_000n
    })
    await testPrisma.user.create({
      data: { id: 'tick-trader', nickname: 'trader', level: 10 }
    })
    const now = new Date()
    // 매수 10주·매도 0 → demandPpm = (10-0)×1000/10 = +1000 (×0.1).
    await testPrisma.tradeLog.create({
      data: {
        fromUserId: 'tick-trader',
        stockId: stock.id,
        kind: 'STOCK_BUY',
        amount: 10n,
        price: 10_000n,
        createdAt: new Date(now.getTime() - 10 * 60 * 1000)
      }
    })

    const result = await StockPriceService.priceTick(testPrisma, { now })

    // 1000 × (10000 + 1000) / 10000 = 1100 (서킷브레이커 상한 1300 안).
    expect(result.rows[0].buyVolume).toBe(10n)
    expect(result.rows[0].sellVolume).toBe(0n)
    expect(result.rows[0].currentPrice).toBe(1_100n)
  })

  it('clamps to ±30% of the day-open tick price (D10 circuit breaker)', async () => {
    const stock = await seedStock({
      issuerId: 'tick-cb',
      currentPrice: 1_000n,
      ipoPrice: 1_000n
    })
    await testPrisma.user.create({
      data: { id: 'tick-cb-trader', nickname: 'trader', level: 10 }
    })
    const now = new Date()
    // 같은 KST 일의 이른 시각에 첫 tick(500) 시드 → 상한 = 500×1.3 = 650.
    const dayStart = kstDayStart(now)
    await testPrisma.stockPriceTick.create({
      data: { stockId: stock.id, price: 500n, tickAt: dayStart }
    })
    // 강한 매수 수급 → raw 1100 이지만 650 으로 clamp.
    await testPrisma.tradeLog.create({
      data: {
        fromUserId: 'tick-cb-trader',
        stockId: stock.id,
        kind: 'STOCK_BUY',
        amount: 10n,
        price: 10_000n,
        createdAt: new Date(now.getTime() - 5 * 60 * 1000)
      }
    })

    const result = await StockPriceService.priceTick(testPrisma, { now })

    expect(result.rows[0].dayOpenPrice).toBe(500n)
    expect(result.rows[0].currentPrice).toBe(650n)
  })

  it('carries the previous close over midnight as the clamp base (D10)', async () => {
    // 전일 상승 마감: ipoPrice 1000 → 직전 종가(currentPrice) 2000.
    // KST 자정 이후 첫 tick — 당일 StockPriceTick 이 없으므로 기준가는
    // 직전 종가(2000)여야 한다. 결함이던 ipoPrice(1000) 폴백이라면 상한이
    // 1300 으로 떨어져 전일 상승분이 자정마다 되돌아간다.
    const stock = await seedStock({
      issuerId: 'tick-carry',
      currentPrice: 2_000n,
      ipoPrice: 1_000n
    })
    await testPrisma.user.create({
      data: { id: 'tick-carry-trader', nickname: 'trader', level: 10 }
    })
    const now = new Date()
    const dayStart = kstDayStart(now)
    // 전일(KST) tick 시드 — 당일 첫 tick 조회(gte dayStart)에 걸리면 안 된다.
    await testPrisma.stockPriceTick.create({
      data: {
        stockId: stock.id,
        price: 2_000n,
        tickAt: new Date(dayStart.getTime() - 60 * 60 * 1000)
      }
    })
    // 매수 10주 → demandPpm +1000 → raw 2000×1.1 = 2200.
    await testPrisma.tradeLog.create({
      data: {
        fromUserId: 'tick-carry-trader',
        stockId: stock.id,
        kind: 'STOCK_BUY',
        amount: 10n,
        price: 20_000n,
        createdAt: new Date(now.getTime() - 5 * 60 * 1000)
      }
    })

    const result = await StockPriceService.priceTick(testPrisma, { now })

    // 기준가 = 직전 종가 2000 → 밴드 1400~2600, raw 2200 은 클램프 없이 통과.
    // (ipoPrice 폴백이었다면 dayOpenPrice=1000·상한 1300 으로 잘렸을 것.)
    expect(result.rows[0].dayOpenPrice).toBe(2_000n)
    expect(result.rows[0].currentPrice).toBe(2_200n)
  })
})
