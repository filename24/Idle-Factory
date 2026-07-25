import { db } from '../db'
import { computeXpProgress } from '../xp-progress'

/**
 * 내 대시보드 데이터 접근 계층 (인증 필요 페이지 전용).
 *
 * 자산·레벨·레벨 내 XP 진행도 + 퀘스트 현황(상태별 집계) + 참여 서버 목록을 조립한다.
 * `User.xp` 는 "레벨 내 XP"(services/reward.ts §applyXp 규약)이므로
 * 진행률 = xp / xpRequiredForLevel(level). 근거: #20 §내 대시보드.
 */

/** 퀘스트 상태별 요약. */
export interface QuestSummary {
  readonly inProgress: number
  readonly completed: number
  readonly claimed: number
  readonly total: number
}

/** 참여 서버 한 줄. */
export interface MyGuild {
  readonly id: string
  readonly name: string
}

/** 내 대시보드 전체 DTO. */
export interface MyDashboard {
  readonly id: string
  readonly nickname: string | null
  readonly level: number
  readonly money: string
  /** 현재 레벨 내 누적 XP. */
  readonly xpInLevel: string
  /** 다음 레벨까지 요구 XP. */
  readonly xpRequired: string
  /** 진행률 0~100 (정수). */
  readonly xpPercent: number
  readonly quests: QuestSummary
  readonly guilds: MyGuild[]
}

/**
 * 게임 User.id 로 내 대시보드 데이터를 조립한다.
 * 세션은 있으나 게임 계정이 없는 경우(게임 미시작) null 을 반환한다.
 *
 * @param gameUserId 게임 User.id (Discord snowflake)
 * @returns 대시보드 DTO 또는 null
 */
export async function getMyDashboard(gameUserId: string): Promise<MyDashboard | null> {
  const user = await db.user.findUnique({
    where: { id: gameUserId },
    select: { id: true, nickname: true, level: true, money: true, xp: true },
  })
  if (!user) return null

  const [questGroups, factoryGuilds, activityGuilds] = await Promise.all([
    db.userQuest.groupBy({ by: ['status'], where: { userId: gameUserId }, _count: { _all: true } }),
    db.factory.findMany({
      where: { userId: gameUserId, guildId: { not: null } },
      select: { guildId: true },
      distinct: ['guildId'],
    }),
    db.guildDailyActivity.findMany({
      where: { userId: gameUserId },
      select: { guildId: true },
      distinct: ['guildId'],
    }),
  ])

  const questCount = (status: string): number =>
    questGroups.find((g) => g.status === status)?._count._all ?? 0
  const quests: QuestSummary = {
    inProgress: questCount('IN_PROGRESS'),
    completed: questCount('COMPLETED'),
    claimed: questCount('CLAIMED'),
    total: questGroups.reduce((sum, g) => sum + g._count._all, 0),
  }

  const guildIds = [
    ...new Set([
      ...factoryGuilds.map((f) => f.guildId).filter((id): id is string => id !== null),
      ...activityGuilds.map((a) => a.guildId),
    ]),
  ]
  const guildRows = guildIds.length
    ? await db.guild.findMany({ where: { id: { in: guildIds } }, select: { id: true, name: true } })
    : []
  const guilds: MyGuild[] = guildRows.map((g) => ({ id: g.id, name: g.name }))

  const { xpRequired, xpInLevel, xpPercent } = computeXpProgress(user.level, user.xp)

  return {
    id: user.id,
    nickname: user.nickname,
    level: user.level,
    money: user.money.toString(),
    xpInLevel: xpInLevel.toString(),
    xpRequired: xpRequired.toString(),
    xpPercent,
    quests,
    guilds,
  }
}
