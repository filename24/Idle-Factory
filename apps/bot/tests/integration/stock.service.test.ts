/**
 * `StockService` 통합 테스트 (전용 *-dev DB).
 *
 * 검증 축 (GitHub #18, 블루프린트 Unit B):
 *  - IPO: 상장 조건 AND 판정(D6)·30~70% 클램프(D7)·중복 상장 차단
 *  - 매수: Lv.10 게이트·자기거래 차단·길드 격리(타 서버 종목 차단)·잔액
 *    차감·가중평균 평단가·유통 상한(D3 float)·rate limit(D11)
 *  - 매도: 보유 검증·대금 지급·수익 실현 시에만 XP(+10)·전량 매도 평단가
 *    0 리셋
 *  - 수확 훅(D8): 상장 공장 수확 → weeklyProfit 적립 + StockProfitLog
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { HarvestService } from '../../src/services/harvest'
import {
  StockService,
  STOCK_RATE_LIMIT_MAX_TRADES,
  STOCK_TRADE_MIN_LEVEL
} from '../../src/services/stock'
import { closeDb, resetDb, testPrisma } from './setup'

const MIN_MS = 60 * 1000

/** 유저 + 스타터 토지(4×4) + 창고 시드 — harvest.service.test.ts 관례. */
async function seedUser(id: string, opts?: { level?: number; money?: bigint }) {
  await testPrisma.user.create({
    data: {
      id,
      nickname: `stock-${id}`,
      level: opts?.level ?? STOCK_TRADE_MIN_LEVEL,
      money: opts?.money ?? 1_000_000n
    }
  })
  const land = await testPrisma.land.create({
    data: { userId: id, index: 1, width: 4, height: 4 }
  })
  await testPrisma.warehouse.create({ data: { userId: id, grade: 1 } })
  return { land }
}

async function seedFactory(params: {
  userId: string
  landId: string
  anchorX?: number
  anchorY?: number
  lastHarvestAt?: Date
}) {
  return testPrisma.factory.create({
    data: {
      userId: params.userId,
      landId: params.landId,
      type: 'FARM',
      tier: 'T1',
      grade: 1,
      anchorX: params.anchorX ?? 0,
      anchorY: params.anchorY ?? 0,
      width: 1,
      height: 1,
      lastHarvestAt: params.lastHarvestAt ?? new Date()
    }
  })
}

/** 상장 종목 시드 — 공장 소유자와 별개로 가격을 직접 지정한다. */
async function seedListedStock(params: {
  issuerId: string
  currentPrice: bigint
  ipoPrice?: bigint
  sharesOutstanding?: number
}) {
  const { land } = await seedUser(params.issuerId, { level: 30 })
  const factory = await seedFactory({
    userId: params.issuerId,
    landId: land.id
  })
  const stock = await testPrisma.stock.create({
    data: {
      factoryId: factory.id,
      market: 'SERVER',
      ipoPrice: params.ipoPrice ?? params.currentPrice,
      currentPrice: params.currentPrice,
      sharesOutstanding: params.sharesOutstanding ?? 100
    }
  })
  return { stock, factory }
}

describe('StockService.ipo', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('rejects userSetPrice < 1 (STOCK_IPO_PRICE_OUT_OF_RANGE)', async () => {
    const { land } = await seedUser('ipo-p0', { level: 25 })
    const factory = await seedFactory({ userId: 'ipo-p0', landId: land.id })
    await expect(
      StockService.ipo(testPrisma, {
        userId: 'ipo-p0',
        factoryId: factory.id,
        userSetPrice: 0n
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_IPO_PRICE_OUT_OF_RANGE'
    })
  })

  it('reports every unmet listing condition (D6)', async () => {
    // Lv.1·공장 1·자산 소액·거래 0회 → 4개 조건 전부 미달.
    const { land } = await seedUser('ipo-fail', { level: 1, money: 100n })
    const factory = await seedFactory({ userId: 'ipo-fail', landId: land.id })

    await expect(
      StockService.ipo(testPrisma, {
        userId: 'ipo-fail',
        factoryId: factory.id,
        userSetPrice: 1_000n
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_LISTING_CONDITION_NOT_MET',
      details: expect.objectContaining({
        failures: [
          'LEVEL',
          'FACTORY_COUNT',
          'TOTAL_ASSETS',
          'RECENT_30D_TRADES'
        ]
      })
    })
    // 롤백 — 종목이 생기지 않는다.
    expect(await testPrisma.stock.count()).toBe(0)
  })

  it('lists a qualified factory and clamps the price into the 30~70% band (D7)', async () => {
    const { land } = await seedUser('ipo-ok', {
      level: 25,
      money: 100_000_000n
    })
    const factories = []
    for (let i = 0; i < 5; i++) {
      factories.push(
        await seedFactory({
          userId: 'ipo-ok',
          landId: land.id,
          anchorX: i % 4,
          anchorY: Math.floor(i / 4)
        })
      )
    }
    // 최근 30일 실거래 10회 (price>0 만 집계됨 — price=0 회수는 제외 규약).
    for (let i = 0; i < 10; i++) {
      await testPrisma.tradeLog.create({
        data: {
          fromUserId: 'ipo-ok',
          kind: 'MARKET_SELL',
          material: 'GRAIN',
          amount: 1n,
          price: 10n
        }
      })
    }

    // 희망가 1 → 하한(기본가 30%)으로 클램프.
    const result = await StockService.ipo(testPrisma, {
      userId: 'ipo-ok',
      factoryId: factories[0].id,
      userSetPrice: 1n
    })

    expect(result.clamped).toBe(true)
    expect(result.finalPrice).toBe((result.defaultIpoPrice * 3_000n) / 10_000n)
    expect(result.stock.market).toBe('SERVER')
    expect(result.stock.ipoPrice).toBe(result.finalPrice)
    expect(result.stock.currentPrice).toBe(result.finalPrice)

    // 같은 공장 재상장 → STOCK_ALREADY_LISTED.
    await expect(
      StockService.ipo(testPrisma, {
        userId: 'ipo-ok',
        factoryId: factories[0].id,
        userSetPrice: result.finalPrice
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_ALREADY_LISTED'
    })
  })
})

describe('StockService.buy', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('rejects a trader below Lv.10 (STOCK_LEVEL_GATE)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-1',
      currentPrice: 100n
    })
    await seedUser('buy-low', { level: STOCK_TRADE_MIN_LEVEL - 1 })

    await expect(
      StockService.buy(testPrisma, {
        userId: 'buy-low',
        stockId: stock.id,
        shares: 1
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'STOCK_LEVEL_GATE' })
  })

  it('blocks the issuer from trading own stock (STOCK_SELF_TRADE)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-2',
      currentPrice: 100n
    })

    await expect(
      StockService.buy(testPrisma, {
        userId: 'buy-issuer-2',
        stockId: stock.id,
        shares: 1
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'STOCK_SELF_TRADE' })
  })

  it('debits money, records the holding and a STOCK_BUY TradeLog', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-3',
      currentPrice: 100n
    })
    await seedUser('buyer-3', { money: 10_000n })

    const result = await StockService.buy(testPrisma, {
      userId: 'buyer-3',
      stockId: stock.id,
      shares: 10
    })

    expect(result.unitPrice).toBe(100n)
    expect(result.totalCost).toBe(1_000n)
    expect(result.holdingShares).toBe(10)
    expect(result.avgBuyPrice).toBe(100n)

    const buyer = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'buyer-3' }
    })
    expect(buyer.money).toBe(9_000n) // 10_000 - 1_000 (무수수료, D4)

    const log = await testPrisma.tradeLog.findFirstOrThrow({
      where: { kind: 'STOCK_BUY' }
    })
    expect(log.fromUserId).toBe('buyer-3')
    expect(log.toUserId).toBeNull() // 상대 = 시스템 (D3)
    expect(log.stockId).toBe(stock.id)
    expect(log.amount).toBe(10n)
    expect(log.price).toBe(1_000n)
  })

  it('recomputes the weighted average buy price across buys', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-4',
      currentPrice: 100n
    })
    await seedUser('buyer-4', { money: 100_000n })

    await StockService.buy(testPrisma, {
      userId: 'buyer-4',
      stockId: stock.id,
      shares: 10
    })
    // 가격 변동 후 재매수 → (10×100 + 10×200) / 20 = 150.
    await testPrisma.stock.update({
      where: { id: stock.id },
      data: { currentPrice: 200n }
    })
    const second = await StockService.buy(testPrisma, {
      userId: 'buyer-4',
      stockId: stock.id,
      shares: 10
    })

    expect(second.holdingShares).toBe(20)
    expect(second.avgBuyPrice).toBe(150n)
  })

  it('rejects when the float is exhausted (D3) and rolls back', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-5',
      currentPrice: 100n,
      sharesOutstanding: 100
    })
    await seedUser('buyer-5a', { money: 100_000n })
    await seedUser('buyer-5b', { money: 100_000n })
    // buyer-5a 가 이미 95주 보유 — 유통 잔여 5주.
    await testPrisma.stockHolding.create({
      data: {
        userId: 'buyer-5a',
        stockId: stock.id,
        shares: 95,
        avgBuyPrice: 100n
      }
    })

    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-5b',
        stockId: stock.id,
        shares: 6
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_FLOAT_EXHAUSTED'
    })

    // 잔액 불변(롤백) + 상한 안(5주)은 체결된다.
    const b = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'buyer-5b' }
    })
    expect(b.money).toBe(100_000n)
    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-5b',
        stockId: stock.id,
        shares: 5
      })
    ).resolves.toMatchObject({ holdingShares: 5 })
  })

  it('rejects with INSUFFICIENT_MONEY and rolls back', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-6',
      currentPrice: 100n
    })
    await seedUser('buyer-6', { money: 999n })

    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-6',
        stockId: stock.id,
        shares: 10
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'INSUFFICIENT_MONEY'
    })
    expect(await testPrisma.stockHolding.count()).toBe(0)
  })

  it('rate-limits the 7th trade in an hour on the same stock (D11)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-7',
      currentPrice: 100n
    })
    await seedUser('buyer-7', { money: 100_000n })

    // 윈도 내 매수+매도 합산 6회 기록 시드.
    for (let i = 0; i < STOCK_RATE_LIMIT_MAX_TRADES; i++) {
      await testPrisma.tradeLog.create({
        data: {
          fromUserId: 'buyer-7',
          stockId: stock.id,
          kind: i % 2 === 0 ? 'STOCK_BUY' : 'STOCK_SELL',
          amount: 1n,
          price: 100n,
          createdAt: new Date(Date.now() - i * MIN_MS)
        }
      })
    }

    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-7',
        stockId: stock.id,
        shares: 1
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_RATE_LIMITED'
    })

    // 윈도(1시간) 밖 기록만 있으면 통과 — 오래된 기록으로 교체.
    await testPrisma.tradeLog.updateMany({
      where: { fromUserId: 'buyer-7' },
      data: { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
    })
    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-7',
        stockId: stock.id,
        shares: 1
      })
    ).resolves.toMatchObject({ shares: 1 })
  })

  it('hides a stock bound to another guild (guild isolation → STOCK_NOT_FOUND)', async () => {
    await testPrisma.guild.create({
      data: { id: 'guild-home', name: 'home-guild' }
    })
    const { stock } = await seedListedStock({
      issuerId: 'buy-issuer-8',
      currentPrice: 100n
    })
    await testPrisma.stock.update({
      where: { id: stock.id },
      data: { guildId: 'guild-home' }
    })
    await seedUser('buyer-8', { money: 100_000n })

    // 다른 서버에서 접근 → "없는 종목" 취급 (08 §시장 구분 "서버 유저만 참여").
    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-8',
        stockId: stock.id,
        shares: 1,
        guildId: 'guild-other'
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'STOCK_NOT_FOUND' })

    // guildId 미전달(null) 컨텍스트도 차단된다.
    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-8',
        stockId: stock.id,
        shares: 1
      })
    ).rejects.toMatchObject({ name: 'ServiceError', code: 'STOCK_NOT_FOUND' })

    // 소속 서버에서는 정상 체결된다.
    await expect(
      StockService.buy(testPrisma, {
        userId: 'buyer-8',
        stockId: stock.id,
        shares: 1,
        guildId: 'guild-home'
      })
    ).resolves.toMatchObject({ shares: 1 })
  })
})

describe('StockService.sell', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('rejects selling more than held (STOCK_INSUFFICIENT_SHARES)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'sell-issuer-1',
      currentPrice: 100n
    })
    await seedUser('seller-1')
    await testPrisma.stockHolding.create({
      data: {
        userId: 'seller-1',
        stockId: stock.id,
        shares: 3,
        avgBuyPrice: 100n
      }
    })

    await expect(
      StockService.sell(testPrisma, {
        userId: 'seller-1',
        stockId: stock.id,
        shares: 4
      })
    ).rejects.toMatchObject({
      name: 'ServiceError',
      code: 'STOCK_INSUFFICIENT_SHARES'
    })
  })

  it('credits proceeds + realize XP(+10) only on profitable sells and resets avgBuyPrice on full exit', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'sell-issuer-2',
      currentPrice: 150n
    })
    await seedUser('seller-2', { money: 0n })
    await testPrisma.stockHolding.create({
      data: {
        userId: 'seller-2',
        stockId: stock.id,
        shares: 10,
        avgBuyPrice: 100n
      }
    })

    // 일부 매도 — 평단가 유지. 체결가 150 > 평단 100 → 수익 실현 XP 지급.
    const partial = await StockService.sell(testPrisma, {
      userId: 'seller-2',
      stockId: stock.id,
      shares: 4
    })
    expect(partial.totalPaid).toBe(600n)
    expect(partial.remainingShares).toBe(6)
    expect(partial.avgBuyPrice).toBe(100n)
    expect(partial.xpAwarded).toBe(10n)

    // 전량 매도 — 평단가 0 리셋 (schema 규약).
    const full = await StockService.sell(testPrisma, {
      userId: 'seller-2',
      stockId: stock.id,
      shares: 6
    })
    expect(full.remainingShares).toBe(0)
    expect(full.avgBuyPrice).toBe(0n)

    const holding = await testPrisma.stockHolding.findUniqueOrThrow({
      where: { userId_stockId: { userId: 'seller-2', stockId: stock.id } }
    })
    expect(holding.shares).toBe(0)
    expect(holding.avgBuyPrice).toBe(0n)

    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'seller-2' }
    })
    expect(seller.money).toBe(1_500n) // 600 + 900, 무수수료·무세금 (D4)
    expect(seller.xp).toBe(20n) // 수익 매도 2건 × 수익 실현 +10 (09 §이벤트별 XP)

    const logs = await testPrisma.tradeLog.findMany({
      where: { kind: 'STOCK_SELL' }
    })
    expect(logs).toHaveLength(2)
    expect(logs.every((l) => l.toUserId === null)).toBe(true) // 시스템 상대 (D3)
  })

  it('awards no XP on a break-even sell (price == avgBuyPrice)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'sell-issuer-3',
      currentPrice: 100n
    })
    await seedUser('seller-3', { money: 0n })
    await testPrisma.stockHolding.create({
      data: {
        userId: 'seller-3',
        stockId: stock.id,
        shares: 5,
        avgBuyPrice: 100n
      }
    })

    const result = await StockService.sell(testPrisma, {
      userId: 'seller-3',
      stockId: stock.id,
      shares: 5
    })

    // 본전 매도 — 수익 실현이 아니므로 XP 미지급 (09 §이벤트별 XP 문면).
    expect(result.xpAwarded).toBe(0n)
    expect(result.leveledUp).toBe(false)
    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'seller-3' }
    })
    expect(seller.money).toBe(500n) // 대금은 정상 지급.
    expect(seller.xp).toBe(0n)
  })

  it('awards no XP on a losing sell (price < avgBuyPrice)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'sell-issuer-4',
      currentPrice: 100n
    })
    await seedUser('seller-4', { money: 0n })
    await testPrisma.stockHolding.create({
      data: {
        userId: 'seller-4',
        stockId: stock.id,
        shares: 5,
        avgBuyPrice: 200n
      }
    })

    const result = await StockService.sell(testPrisma, {
      userId: 'seller-4',
      stockId: stock.id,
      shares: 5
    })

    // 손실 매도 — XP 파밍(매수↔매도 반복) 차단.
    expect(result.xpAwarded).toBe(0n)
    expect(result.leveledUp).toBe(false)
    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'seller-4' }
    })
    expect(seller.xp).toBe(0n)
  })

  it('awards no XP when avgBuyPrice is 0 (legacy/edge data)', async () => {
    const { stock } = await seedListedStock({
      issuerId: 'sell-issuer-5',
      currentPrice: 100n
    })
    await seedUser('seller-5', { money: 0n })
    // avgBuyPrice=0 — 이전 데이터/엣지: 손익 판정 불가 → 미지급 규약.
    await testPrisma.stockHolding.create({
      data: {
        userId: 'seller-5',
        stockId: stock.id,
        shares: 5,
        avgBuyPrice: 0n
      }
    })

    const result = await StockService.sell(testPrisma, {
      userId: 'seller-5',
      stockId: stock.id,
      shares: 5
    })

    expect(result.xpAwarded).toBe(0n)
    expect(result.leveledUp).toBe(false)
    const seller = await testPrisma.user.findUniqueOrThrow({
      where: { id: 'seller-5' }
    })
    expect(seller.xp).toBe(0n)
  })
})

describe('harvest accrual hook (D8)', () => {
  beforeEach(async () => {
    await resetDb()
  })

  it('accrues weeklyProfit + StockProfitLog when a listed factory harvests', async () => {
    const issuerId = 'harvest-issuer'
    const { land } = await seedUser(issuerId, { level: 30 })
    const thirtyMinAgo = new Date(Date.now() - 30 * MIN_MS)
    const factory = await seedFactory({
      userId: issuerId,
      landId: land.id,
      lastHarvestAt: thirtyMinAgo
    })
    const stock = await testPrisma.stock.create({
      data: {
        factoryId: factory.id,
        market: 'SERVER',
        ipoPrice: 1_000n,
        currentPrice: 1_000n
      }
    })
    await testPrisma.globalMarketPrice.create({
      data: { material: 'GRAIN', basePrice: 10n, currentPrice: 12n }
    })

    const result = await HarvestService.harvestAll(testPrisma, issuerId)

    const producedGrain =
      result.factories.find((f) => f.factoryId === factory.id)?.produced
        .GRAIN ?? 0n
    expect(producedGrain > 0n).toBe(true)
    const expected = producedGrain * 12n // 수확 수량 × 글로벌 현재가 (D8)

    expect(result.stockProfits).toEqual([
      { stockId: stock.id, factoryId: factory.id, amount: expected }
    ])

    const updated = await testPrisma.stock.findUniqueOrThrow({
      where: { id: stock.id }
    })
    expect(updated.weeklyProfit).toBe(expected)

    const logs = await testPrisma.stockProfitLog.findMany({
      where: { stockId: stock.id }
    })
    expect(logs).toHaveLength(1)
    expect(logs[0].amount).toBe(expected)
  })

  it('does not accrue for unlisted factories', async () => {
    const { land } = await seedUser('harvest-plain', { level: 30 })
    await seedFactory({
      userId: 'harvest-plain',
      landId: land.id,
      lastHarvestAt: new Date(Date.now() - 30 * MIN_MS)
    })
    await testPrisma.globalMarketPrice.create({
      data: { material: 'GRAIN', basePrice: 10n, currentPrice: 12n }
    })

    const result = await HarvestService.harvestAll(testPrisma, 'harvest-plain')

    expect(result.stockProfits).toEqual([])
    expect(await testPrisma.stockProfitLog.count()).toBe(0)
  })
})
