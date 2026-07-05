/**
 * 주가 tick 서비스 (#18).
 *
 * 1시간 주기로 전 상장 종목의 가격을 재계산한다 (docs/design/08-stock.md
 * §주가 변동). 산식은 순수 모듈 `@idle/game-core` 의 `computeNextStockPrice`
 * 에 위임하고, 이 서비스는 DB 집계(D9)와 서킷브레이커 기준가(D10)만 조립해
 * 주입한다 — marketPrice.ts 패턴.
 *
 * 집계 규약 (D9):
 *  - demandPressure 입력: `TradeLog.stockId` 로 최근 1시간 STOCK_BUY /
 *    STOCK_SELL 주수(amount) 합산 — `[stockId, kind, createdAt]` 인덱스.
 *  - profitDelta 입력: `StockProfitLog` 24시간 합(last24hProfit)과
 *    7일 합 ÷ 7(avg7dProfit) — `[stockId, createdAt]` 인덱스.
 *  - 서킷브레이커 기준가(D10): 해당 KST 일의 첫 `StockPriceTick` 가격,
 *    당일 tick 이 없으면 직전 종가(`Stock.currentPrice` = 오늘 시가).
 *    상장 당일에도 `currentPrice` 는 최종 IPO 가와 같으므로 별도의
 *    ipoPrice 폴백이 필요 없다.
 *
 * 참조: docs/design/08-stock.md §주가 변동, GitHub #18
 */

import type { PrismaClient } from '@idle/database'
import { computeNextStockPrice, kstDayStart } from '@idle/game-core'
import { runInTx } from './base'

/** 1시간(ms) — 수급 집계 윈도 (docs/design/08-stock.md §주가 변동 "최근 1시간"). */
const HOUR_MS = 60 * 60 * 1000

/** 24시간(ms) — last24hProfit 집계 윈도. */
const DAY_MS = 24 * HOUR_MS

/** 7일(ms) — avg7dProfit 집계 윈도. */
const WEEK_MS = 7 * DAY_MS

/** avg7dProfit 분모 — 7일 합을 일평균으로 환산 (BigInt floor). */
const AVG_PROFIT_DAYS = 7n

/** `StockPriceService.priceTick` 옵션. */
export interface StockPriceTickOptions {
  /** tick 기준 시각 — 생략 시 호출 시각. 윈도 경계·`tickAt` 테스트 결정성용. */
  readonly now?: Date
}

/** 한 종목의 tick 결과 — 로깅·관측용 스냅샷. */
export interface StockPriceTickRow {
  readonly stockId: string
  /** tick 이전 가격. */
  readonly previousPrice: bigint
  /** tick 이후 가격. */
  readonly currentPrice: bigint
  /** 최근 1시간 매수 주수 합. */
  readonly buyVolume: bigint
  /** 최근 1시간 매도 주수 합. */
  readonly sellVolume: bigint
  /** 최근 24시간 수익 합. */
  readonly last24hProfit: bigint
  /** 최근 7일 일평균 수익. */
  readonly avg7dProfit: bigint
  /** 서킷브레이커 기준가 (당일 첫 tick 가격, 없으면 직전 종가 — D10). */
  readonly dayOpenPrice: bigint
}

/** `StockPriceService.priceTick` 결과. */
export interface StockPriceTickResult {
  /** 재계산된 종목 수. */
  readonly updatedCount: number
  /** 종목별 변경 내역. */
  readonly rows: readonly StockPriceTickRow[]
}

export const StockPriceService = {
  /**
   * 전 상장 종목의 주가를 일괄 재계산한다 (1시간 tick 전용).
   *
   * 단일 트랜잭션(Serializable) 안에서:
   *  1. TradeLog(1시간 수급)·StockProfitLog(24시간/7일 수익)를 groupBy 로
   *     배치 집계 — 종목 수만큼의 N+1 쿼리를 피한다.
   *  2. 종목별로 당일(KST) 첫 tick 가격을 조회해 서킷브레이커 기준가로
   *     쓰고 (없으면 직전 종가 `currentPrice` — D10), `computeNextStockPrice`
   *     호출.
   *  3. `StockPriceTick.create` + `Stock.update(currentPrice, lastTickAt)`.
   *
   * 상장 종목이 없으면 아무것도 하지 않는다(updatedCount=0).
   * 산식이 결정적이라 marketPrice.ts 와 달리 노이즈 주입이 없다 —
   * 테스트는 `now` 만 주입하면 완전 결정적이다.
   */
  async priceTick(
    prisma: PrismaClient,
    options?: StockPriceTickOptions
  ): Promise<StockPriceTickResult> {
    const now = options?.now ?? new Date()
    const volumeWindowStart = new Date(now.getTime() - HOUR_MS)
    const profit24hStart = new Date(now.getTime() - DAY_MS)
    const profit7dStart = new Date(now.getTime() - WEEK_MS)
    const dayStart = kstDayStart(now)

    return runInTx(prisma, async (tx) => {
      const stocks = await tx.stock.findMany({ orderBy: { listedAt: 'asc' } })
      if (stocks.length === 0) return { updatedCount: 0, rows: [] }

      // 1) 수급 배치 집계 — 최근 1시간 STOCK_BUY/STOCK_SELL 주수 합 (D9).
      const volumeGroups = await tx.tradeLog.groupBy({
        by: ['stockId', 'kind'],
        where: {
          stockId: { not: null },
          kind: { in: ['STOCK_BUY', 'STOCK_SELL'] },
          createdAt: { gte: volumeWindowStart, lte: now }
        },
        _sum: { amount: true }
      })
      const buyByStock = new Map<string, bigint>()
      const sellByStock = new Map<string, bigint>()
      for (const g of volumeGroups) {
        if (!g.stockId) continue
        const sum = g._sum.amount ?? 0n
        if (g.kind === 'STOCK_BUY') buyByStock.set(g.stockId, sum)
        else sellByStock.set(g.stockId, sum)
      }

      // 2) 수익 배치 집계 — 24시간 합 / 7일 합 (D9).
      const [profit24hGroups, profit7dGroups] = [
        await tx.stockProfitLog.groupBy({
          by: ['stockId'],
          where: { createdAt: { gte: profit24hStart, lte: now } },
          _sum: { amount: true }
        }),
        await tx.stockProfitLog.groupBy({
          by: ['stockId'],
          where: { createdAt: { gte: profit7dStart, lte: now } },
          _sum: { amount: true }
        })
      ]
      const profit24hByStock = new Map(
        profit24hGroups.map((g) => [g.stockId, g._sum.amount ?? 0n])
      )
      const profit7dByStock = new Map(
        profit7dGroups.map((g) => [g.stockId, g._sum.amount ?? 0n])
      )

      const rows: StockPriceTickRow[] = []
      for (const stock of stocks) {
        // 서킷브레이커 기준가 (D10): 해당 KST 일의 첫 tick, 없으면 직전
        // 종가(currentPrice = 오늘 시가). ipoPrice 폴백은 전일 상승분을 매일
        // 자정마다 되돌리는 결함이라 제거 — 상장 당일에도 currentPrice 가
        // 최종 IPO 가와 같아 동작이 동일하다.
        // 종목 수는 서버당 소수(v0)라 건별 findFirst 로 충분하다.
        const dayOpenTick = await tx.stockPriceTick.findFirst({
          where: { stockId: stock.id, tickAt: { gte: dayStart } },
          orderBy: { tickAt: 'asc' },
          select: { price: true }
        })
        const dayOpenPrice = dayOpenTick?.price ?? stock.currentPrice

        const buyVolume = buyByStock.get(stock.id) ?? 0n
        const sellVolume = sellByStock.get(stock.id) ?? 0n
        const last24hProfit = profit24hByStock.get(stock.id) ?? 0n
        // 7일 일평균 — 합 ÷ 7 floor. 0 이면 profitDelta=0 (U-5 가드, 순수 함수 내).
        const avg7dProfit =
          (profit7dByStock.get(stock.id) ?? 0n) / AVG_PROFIT_DAYS

        const nextPrice = computeNextStockPrice({
          prevPrice: stock.currentPrice,
          buyVolume,
          sellVolume,
          last24hProfit,
          avg7dProfit,
          dayOpenPrice
        })

        await tx.stockPriceTick.create({
          data: { stockId: stock.id, price: nextPrice, tickAt: now }
        })
        await tx.stock.update({
          where: { id: stock.id },
          data: { currentPrice: nextPrice, lastTickAt: now }
        })

        rows.push({
          stockId: stock.id,
          previousPrice: stock.currentPrice,
          currentPrice: nextPrice,
          buyVolume,
          sellVolume,
          last24hProfit,
          avg7dProfit,
          dayOpenPrice
        })
      }

      return { updatedCount: rows.length, rows }
    })
  }
} as const
