import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'

import { StockPriceService } from '../services/stockPrice'

/**
 * 주가 변동 스케줄 주기 (밀리초).
 *
 * 1시간마다 전 상장 종목의 가격을 재계산한다
 * (docs/design/08-stock.md §주가 변동 — "변동 주기: 1시간").
 */
export const STOCK_PRICE_TICK_INTERVAL_MS = 60 * 60 * 1000

/**
 * 전 상장 종목의 주가를 일괄 재계산하는 위임 로직.
 *
 * 스케줄 피스(`StockPriceTickTask.run`)와 분리해 단위 테스트가 가능하도록
 * 순수 함수로 노출한다. 실제 재계산(TradeLog/StockProfitLog 집계 →
 * `computeNextStockPrice` → StockPriceTick 삽입 + Stock.currentPrice/lastTickAt
 * 갱신)은 `StockPriceService.priceTick` 에 위임한다 — 산식이 결정적이라
 * marketPrice 와 달리 노이즈 주입이 없다 (docs/design/08-stock.md §주가 변동).
 *
 * @param prisma - DB 클라이언트
 * @returns 재계산된 종목 수
 */
export async function runStockPriceTick(prisma: PrismaClient): Promise<number> {
  const { updatedCount } = await StockPriceService.priceTick(prisma)
  if (updatedCount > 0) {
    container.logger.info(
      `[stock-price-tick] recalculated ${updatedCount} stock prices`
    )
  }
  return updatedCount
}

/**
 * 주가 변동 tick 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 1시간 interval 반복 잡.
 * 로그인 직후 플러그인이 `createRepeated()` 로 반복 잡을 큐에 upsert 하므로,
 * 다중 샤드 환경에서도 큐 단위로 중복 없이 occurrence 당 1회만 실행된다.
 */
export class StockPriceTickTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      interval: STOCK_PRICE_TICK_INTERVAL_MS
    })
  }

  public async run(): Promise<void> {
    await runStockPriceTick(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'stock-price-tick': never
  }
}
