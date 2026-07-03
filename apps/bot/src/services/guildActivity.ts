/**
 * 서버×유저 일간 활동 기록 서비스 (#16).
 *
 * `Guild.weeklyDAU` 집계의 원천 데이터를 쌓는다 — #17 신뢰도 공식
 * (`delta = floor(weeklyDAU × 0.5) - baselineDecay`, docs/design/07-global-system.md
 * §신뢰도 변동)의 입력이 선행 축적되어야 하므로 이 이슈에서 시작한다.
 *
 * 기록 시점: 슬래시 커맨드 성공(listeners/commandActivity.ts). 서버(길드)
 * 컨텍스트가 있는 실행만 대상 — DM 실행은 서버 활동이 아니다.
 * 일자 키는 KST 자정 경계 (kstDayStart — 정산·직구매와 동일 기준).
 */

import type { PrismaClient } from '@idle/database'
import { kstDayStart } from '@idle/game-core'

/** `recordDailyActivity` 입력. */
export interface RecordActivityInput {
  /** 활동이 발생한 서버 snowflake. */
  readonly guildId: string
  /** 활동 유저 snowflake. */
  readonly userId: string
  /** 기준 시각 주입 — KST 일자 키 테스트용. 생략 시 호출 시각. */
  readonly now?: Date
}

export const GuildActivityService = {
  /**
   * 서버×유저×일자 활동을 멱등 기록한다.
   *
   * `createMany + skipDuplicates` 로 단일 INSERT … ON CONFLICT DO NOTHING —
   * 같은 날 반복 실행돼도 1행만 남고, upsert 의 update 경로가 없어 커맨드
   * 훅 부담이 최소다. FK 없는 테이블이라 유저/길드 행 시드 여부와 무관하게
   * 성공한다 (schema `GuildDailyActivity` 주석).
   *
   * @returns 새로 기록됐으면 true, 이미 있었으면 false
   */
  async recordDailyActivity(
    prisma: PrismaClient,
    input: RecordActivityInput
  ): Promise<boolean> {
    const date = kstDayStart(input.now ?? new Date())
    const { count } = await prisma.guildDailyActivity.createMany({
      data: [{ guildId: input.guildId, userId: input.userId, date }],
      skipDuplicates: true
    })
    return count > 0
  }
} as const
