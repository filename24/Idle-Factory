/**
 * 마켓 만료 매물 회수 스케줄러.
 *
 * `ready` 시점에 부트스트랩되어 5분 주기로 `MarketService.expireStale` 을
 * 호출한다. Sapphire 의 `@sapphire/plugin-scheduled-tasks` 가 도입되면
 * ScheduledTask 로 마이그레이션 예정.
 *
 * 에러는 swallow + 로그만 남긴다 — 스케줄러 한 사이클 실패가 봇 전체를
 * 죽이지 않도록.
 */

import { container } from '@sapphire/framework'
import Logger from '@utils/Logger'
import { MarketService } from './market'

const TICK_MS = 5 * 60 * 1000
const logger = new Logger('marketExpire')

let timer: NodeJS.Timeout | null = null

/**
 * 스케줄러 시작. 중복 호출되어도 단일 인터벌만 유지한다.
 */
export function startMarketExpireScheduler(): void {
  if (timer) return
  timer = setInterval(() => {
    void runOnce()
  }, TICK_MS)
  // 프로세스 종료를 막지 않게.
  timer.unref?.()
  // 기동 직후 한 번 즉시 실행 (만료 즉시 회수).
  void runOnce()
}

/**
 * 테스트/셧다운에서 명시적으로 멈추고 싶을 때 호출.
 */
export function stopMarketExpireScheduler(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

async function runOnce(): Promise<void> {
  try {
    const { expiredCount } = await MarketService.expireStale(container.db)
    if (expiredCount > 0) {
      logger.info(`expired ${expiredCount} stale market listings`)
    }
  } catch (err) {
    container.logger.error('[marketExpire] expireStale failed', err)
  }
}
