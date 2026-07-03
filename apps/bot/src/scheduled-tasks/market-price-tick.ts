import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'

import { MarketPriceService } from '../services/marketPrice'

/**
 * 글로벌 마켓 가격 변동 스케줄 주기 (밀리초).
 *
 * 30분마다 전 자재 가격을 재계산한다
 * (docs/design/06-market.md §가격 변동 — "변동 주기: 30분").
 */
export const MARKET_PRICE_TICK_INTERVAL_MS = 30 * 60 * 1000

/**
 * 전 자재 가격을 일괄 재계산하는 위임 로직.
 *
 * 스케줄 피스(`MarketPriceTickTask.run`)와 분리해 단위 테스트가 가능하도록
 * 순수 함수로 노출한다. 실제 재계산(노이즈 생성 + currentPrice 갱신 +
 * recentSales 윈도 리셋 + EMA 갱신)은 `MarketPriceService.priceTick` 에
 * 위임한다.
 *
 * @param prisma - DB 클라이언트
 * @returns 재계산된 자재 수
 */
export async function runMarketPriceTick(
  prisma: PrismaClient
): Promise<number> {
  const { updatedCount } = await MarketPriceService.priceTick(prisma)
  if (updatedCount > 0) {
    container.logger.info(
      `[market-price-tick] recalculated ${updatedCount} material prices`
    )
  }
  return updatedCount
}

/**
 * 글로벌 마켓 가격 tick 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 30분 interval 반복 잡.
 * 로그인 직후 플러그인이 `createRepeated()` 로 반복 잡을 큐에 upsert 하므로,
 * 다중 샤드 환경에서도 큐 단위로 중복 없이 occurrence 당 1회만 실행된다.
 */
export class MarketPriceTickTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      interval: MARKET_PRICE_TICK_INTERVAL_MS
    })
  }

  public async run(): Promise<void> {
    await runMarketPriceTick(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'market-price-tick': never
  }
}
