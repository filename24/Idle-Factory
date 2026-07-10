/**
 * `StockDividendService` 통합 테스트 (전용 *-dev DB).
 *
 * 검증 축 (GitHub #18, D14):
 *  - 보유 지분 비례 지급: 주당 배당금 × 보유 주수, TradeLog(DIVIDEND) 기록
 *  - weeklyProfit 리셋 (배당 0 종목 포함)
 *  - 멱등성: `StockDividend(stockId, weekStart)` 앵커 — 재실행 시 스킵,
 *    이중 지급 없음
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { StockDividendService } from '../../src/services/stockDividend'
import { closeDb, resetDb, testPrisma } from './setup'

async function seedUser(id: string, money = 0n) {
  await testPrisma.user.create({
    data: { id, nickname: `div-${id}`, level: 10, money }
  })
}

/** 상장 종목 시드 — 발행자·토지·공장 포함. */
async function seedStock(params: {
  issuerId: string
  weeklyProfit: bigint
  dividendRatePpm?: number
}) {
  await seedUser(params.issuerId)
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
      ipoPrice: 1_000n,
      currentPrice: 1_000n,
      weeklyProfit: params.weeklyProfit,
      ...(params.dividendRatePpm !== undefined
        ? { dividendRatePpm: params.dividendRatePpm }
        : {})
    }
  })
}

describe('StockDividendService.settleDividends', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('pays holders pro-rata, logs DIVIDEND trades and resets weeklyProfit', async () => {
    // 주당 배당 = (70_000 × 1000‱) / (10000 × 100주) = 70.
    const stock = await seedStock({
      issuerId: 'div-issuer-1',
      weeklyProfit: 70_000n
    })
    await seedUser('holder-a', 0n)
    await seedUser('holder-b', 0n)
    await testPrisma.stockHolding.createMany({
      data: [
        { userId: 'holder-a', stockId: stock.id, shares: 10, avgBuyPrice: 1n },
        { userId: 'holder-b', stockId: stock.id, shares: 5, avgBuyPrice: 1n }
      ]
    })

    const result = await StockDividendService.settleDividends(testPrisma)

    expect(result.settledStocks).toBe(1)
    expect(result.skippedStocks).toBe(0)
    expect(result.failures).toEqual([])
    expect(result.totalPaid).toBe(70n * 10n + 70n * 5n) // 1050

    const a = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'holder-a' }
    })
    const b = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'holder-b' }
    })
    expect(a.money).toBe(700n)
    expect(b.money).toBe(350n)

    const updated = await testPrisma.stock.findUniqueOrThrow({
      where: { id: stock.id }
    })
    expect(updated.weeklyProfit).toBe(0n) // 주간 수익 리셋 (D2)

    const header = await testPrisma.stockDividend.findFirstOrThrow({
      where: { stockId: stock.id }
    })
    expect(header.totalPaid).toBe(1_050n)
    expect(header.weekStart).toEqual(result.weekStart)

    const logs = await testPrisma.tradeLog.findMany({
      where: { kind: 'DIVIDEND' },
      orderBy: { toUserId: 'asc' }
    })
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({
      fromUserId: null, // 시스템 지급
      toUserId: 'holder-a',
      stockId: stock.id,
      amount: 10n,
      price: 700n
    })
  })

  it('is idempotent — a second run skips and never double-pays (D14)', async () => {
    const stock = await seedStock({
      issuerId: 'div-issuer-2',
      weeklyProfit: 70_000n
    })
    await seedUser('holder-c', 0n)
    await testPrisma.stockHolding.create({
      data: {
        userId: 'holder-c',
        stockId: stock.id,
        shares: 10,
        avgBuyPrice: 1n
      }
    })

    const first = await StockDividendService.settleDividends(testPrisma)
    expect(first.settledStocks).toBe(1)

    // weeklyProfit 이 리셋 전 값으로 복원돼도(방어 시나리오) 앵커가 재지급을 막는다.
    await testPrisma.stock.update({
      where: { id: stock.id },
      data: { weeklyProfit: 70_000n }
    })
    const second = await StockDividendService.settleDividends(testPrisma)

    expect(second.settledStocks).toBe(0)
    expect(second.skippedStocks).toBe(1)
    expect(second.totalPaid).toBe(0n)

    const holder = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'holder-c' }
    })
    expect(holder.money).toBe(700n) // 1회분만 지급

    expect(
      await testPrisma.stockDividend.count({ where: { stockId: stock.id } })
    ).toBe(1)
    expect(
      await testPrisma.tradeLog.count({ where: { kind: 'DIVIDEND' } })
    ).toBe(1)
  })

  it('still anchors + resets a zero-profit stock without paying', async () => {
    const stock = await seedStock({
      issuerId: 'div-issuer-3',
      weeklyProfit: 0n
    })
    await seedUser('holder-d', 0n)
    await testPrisma.stockHolding.create({
      data: {
        userId: 'holder-d',
        stockId: stock.id,
        shares: 10,
        avgBuyPrice: 1n
      }
    })

    const result = await StockDividendService.settleDividends(testPrisma)

    expect(result.settledStocks).toBe(1)
    expect(result.totalPaid).toBe(0n)

    const header = await testPrisma.stockDividend.findFirstOrThrow({
      where: { stockId: stock.id }
    })
    expect(header.totalPaid).toBe(0n)
    expect(
      await testPrisma.tradeLog.count({ where: { kind: 'DIVIDEND' } })
    ).toBe(0)
    const holder = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'holder-d' }
    })
    expect(holder.money).toBe(0n)
  })
})
