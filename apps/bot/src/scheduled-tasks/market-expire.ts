import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'

import { MarketService } from '../services/market'

/**
 * 마켓 만료 매물 회수 스케줄 주기 (밀리초).
 *
 * 등록 기간(최대 30일)이 지난 매물을 자동 회수한다
 * (docs/design/06-market.md L62 — "최대 30일 (유저 선택), 이후 자동 회수").
 * 5분 sweep 주기는 이전 in-process `setInterval` 스케줄러에서 이어받은 운영
 * 값이며 설계 공식이 아니다.
 */
export const MARKET_EXPIRE_INTERVAL_MS = 5 * 60 * 1000

/**
 * 만료된 ACTIVE 매물을 회수하는 위임 로직.
 *
 * 스케줄 피스(`MarketExpireTask.run`)와 분리해 단위 테스트가 가능하도록 순수
 * 함수로 노출한다. 실제 회수(창고 반환 + 상태 갱신)는
 * `MarketService.expireStale` 에 위임한다.
 *
 * @param prisma - DB 클라이언트
 * @returns 회수된 매물 수
 */
export async function runMarketExpire(prisma: PrismaClient): Promise<number> {
  const { expiredCount } = await MarketService.expireStale(prisma)
  if (expiredCount > 0) {
    container.logger.info(
      `[market-expire] expired ${expiredCount} stale market listings`
    )
  }
  return expiredCount
}

/**
 * 마켓 만료 회수 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 5분 interval 반복 잡.
 * 로그인 직후 플러그인이 `createRepeated()` 로 반복 잡을 큐에 upsert 하므로,
 * 다중 샤드 환경에서도 큐 단위로 중복 없이 occurrence 당 1회만 실행된다.
 */
export class MarketExpireTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      interval: MARKET_EXPIRE_INTERVAL_MS
    })
  }

  public async run(): Promise<void> {
    await runMarketExpire(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'market-expire': never
  }
}
