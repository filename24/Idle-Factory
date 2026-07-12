import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'

import { StockDividendService } from '../services/stockDividend'

/**
 * 주간 배당 정산 cron 패턴 — 매주 토요일 15:00 UTC.
 *
 * 정산 기준 시각은 **일요일 00:00 KST** (docs/design/08-stock.md §배당 시스템,
 * D2 — weekly-settlement 와 동일 문자열 재사용). 이슈 본문의 "일요일 UTC 00:00"
 * 은 오류다. 플러그인 timezone 기본값이 'UTC' 이므로 패턴은 UTC 로 해석된다.
 */
export const STOCK_DIVIDEND_CRON = '0 15 * * 6'

/**
 * 주간 배당 정산을 실행하는 위임 로직.
 *
 * 스케줄 피스(`StockDividendTask.run`)와 분리해 단위 테스트가 가능하도록
 * 순수 함수로 노출한다. 실제 정산(종목별 개별 tx 로 주당 배당금 계산 +
 * 보유자 지급 + weeklyProfit 리셋 + StockDividend 헤더 삽입)은
 * `StockDividendService.settleDividends` 에 위임한다 —
 * (stockId, weekStart) unique 앵커 덕에 중복 실행돼도 종목당 1회만 지급된다
 * (docs/design/08-stock.md §배당 시스템, D14).
 *
 * @param prisma - DB 클라이언트
 * @returns 이번 실행에서 배당이 정산된 종목 수
 */
export async function runStockDividend(prisma: PrismaClient): Promise<number> {
  const result = await StockDividendService.settleDividends(prisma)
  container.logger.info(
    `[stock-dividend] week=${result.weekStart.toISOString()} ` +
      `settled=${result.settledStocks} skipped=${result.skippedStocks} ` +
      `totalPaid=${result.totalPaid}`
  )
  // 종목 단위 실패는 잡을 죽이지 않고 관측만 남긴다 — 다음 실행(멱등)에서 재시도.
  for (const failure of result.failures) {
    container.logger.error(
      `[stock-dividend] stock settlement failed (stock=${failure.stockId}): ${failure.message}`
    )
  }
  return result.settledStocks
}

/**
 * 주간 배당 정산 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 cron 반복 잡 —
 * UTC 토 15:00 = KST 일 00:00 (D2). 로그인 직후 플러그인이 `createRepeated()`
 * 로 반복 잡을 큐에 upsert 하므로, 다중 샤드 환경에서도 큐 단위로 중복 없이
 * occurrence 당 1회만 실행된다. 만에 하나 중복 실행돼도 배당 정산 자체가
 * 멱등이다 (`StockDividendService.settleDividends` JSDoc, D14).
 */
export class StockDividendTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      pattern: STOCK_DIVIDEND_CRON
    })
  }

  public async run(): Promise<void> {
    await runStockDividend(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'stock-dividend': never
  }
}
