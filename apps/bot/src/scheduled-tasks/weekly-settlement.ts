import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'
import { EMERGENCY_SUPPORT_CAP } from '@idle/game-core'

import { GuildService } from '../services/guild'
import { WeeklySettlementService } from '../services/weeklySettlement'

/**
 * 주간 세금 정산 cron 패턴 — 매주 토요일 15:00 UTC.
 *
 * 정산 기준 시각은 **일요일 00:00 KST** (docs/design/07-global-system.md
 * §정산 주기, U-6 2026-07-03 확정 — "cron 은 UTC 토요일 15:00 로 등록").
 * 플러그인 timezone 기본값이 'UTC' 이므로 패턴은 UTC 로 해석된다.
 */
export const WEEKLY_SETTLEMENT_CRON = '0 15 * * 6'

/**
 * 주간 세금 정산을 실행하는 위임 로직.
 *
 * 스케줄 피스(`WeeklySettlementTask.run`)와 분리해 단위 테스트가 가능하도록
 * 순수 함수로 노출한다. 실제 정산(수익 집계 + 누진 과세 + 금고 적립 +
 * weeklyDAU 갱신)은 `WeeklySettlementService.settleWeek` 에 위임한다 —
 * (userId, weekStart) unique 앵커 덕에 중복 실행돼도 유저당 1회만 처리된다.
 *
 * 정산 직후 `GuildService.applyWeeklyCredit` 로 주간 신뢰도 증감·긴급 지원금을
 * 적용한다 (#17). **순서 중요**: settleWeek 내부의 `refreshWeeklyDau` 가 직전 주
 * DAU 로 `Guild.weeklyDAU` 를 갱신한 뒤여야 신뢰도 입력이 "지난 주 DAU" 가 된다.
 *
 * @param prisma - DB 클라이언트
 * @returns 이번 실행에서 정산된 유저 수
 */
export async function runWeeklySettlement(
  prisma: PrismaClient
): Promise<number> {
  const result = await WeeklySettlementService.settleWeek(prisma)
  container.logger.info(
    `[weekly-settlement] week=${result.weekStart.toISOString()} ` +
      `settled=${result.settledUsers} skipped=${result.skippedUsers} ` +
      `taxPaid=${result.totalTaxPaid} vault=${result.totalVaultDeposited} ` +
      `unpaid=${result.totalUnpaid} dauGuilds=${result.dauUpdatedGuilds} ` +
      `prunedActivity=${result.prunedActivityRows}`
  )
  // 유저 단위 실패는 잡을 죽이지 않고 관측만 남긴다 — 다음 실행(멱등)에서 재시도.
  for (const failure of result.failures) {
    container.logger.error(
      `[weekly-settlement] user settlement failed (user=${failure.userId}): ${failure.message}`
    )
  }

  // 주간 신뢰도 증감 + 긴급 지원금 (refreshWeeklyDau 이후 = 지난 주 DAU 입력).
  const credit = await GuildService.applyWeeklyCredit(prisma)
  container.logger.info(
    `[weekly-settlement] credit updated=${credit.updatedGuilds} ` +
      `emergencySupported=${credit.emergencySupportedGuildIds.length}`
  )
  for (const guildId of credit.emergencySupportedGuildIds) {
    container.logger.warn(
      `[weekly-settlement] emergency support issued (guild=${guildId}): vault topped up to ${EMERGENCY_SUPPORT_CAP}`
    )
  }

  return result.settledUsers
}

/**
 * 주간 세금 정산 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 cron 반복 잡 —
 * UTC 토 15:00 = KST 일 00:00 (U-6). 로그인 직후 플러그인이
 * `createRepeated()` 로 반복 잡을 큐에 upsert 하므로, 다중 샤드 환경에서도
 * 큐 단위로 중복 없이 occurrence 당 1회만 실행된다. 만에 하나 중복 실행돼도
 * 정산 자체가 멱등이다 (`WeeklySettlementService.settleWeek` JSDoc).
 */
export class WeeklySettlementTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      pattern: WEEKLY_SETTLEMENT_CRON
    })
  }

  public async run(): Promise<void> {
    await runWeeklySettlement(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'weekly-settlement': never
  }
}
