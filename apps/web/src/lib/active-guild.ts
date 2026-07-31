import { db } from './db'

/**
 * 웹에서 실행하는 게임 행동의 **서버(길드) 맥락** 해석.
 *
 * ## 왜 필요한가
 *
 * 봇의 건설·업그레이드는 `guildId` 를 받아 세 가지에 쓴다:
 *  1. 신뢰도 기반 기능 차단(`CREDIT_RESTRICTED`)
 *  2. 유효 최대 등급 — 신뢰도에 따라 8 / 9 / 10
 *  3. XP 보너스
 *
 * 웹에는 "지금 어느 서버에서 명령을 쳤는가"에 해당하는 것이 없다. 여기서
 * `null` 을 그냥 넘기면 **웹으로 업그레이드한 유저만 조용히 9·10등급을 잃고
 * XP 보너스도 못 받는다.** 화면에는 아무 설명도 뜨지 않으므로 유저가 원인을
 * 알 방법이 없다 — 이건 버그로 취급해야 한다.
 *
 * ## 어떻게 정하는가
 *
 * 가장 최근에 활동한 서버를 쓴다. `GuildDailyActivity` 는 길드 컨텍스트에서
 * 슬래시 커맨드를 쓸 때마다 기록되므로, "이 유저가 주로 노는 서버"에 대한
 * 가장 좋은 근사값이다. 활동 기록이 없으면 공장이 속한 서버로 폴백한다.
 *
 * 둘 다 없으면 `null` 이고, 그때는 **UI 가 그 사실과 결과(상한 8등급)를
 * 명시적으로 알려야 한다.** 조용히 넘기지 말 것.
 */

/** 해석된 서버 맥락. */
export interface ActiveGuild {
  readonly guildId: string
  readonly name: string | null
}

/**
 * 유저의 활동 서버를 해석한다.
 *
 * @param gameUserId 게임 User.id
 * @returns 서버 맥락. 판단 근거가 없으면 `null`
 */
export async function resolveActiveGuild(gameUserId: string): Promise<ActiveGuild | null> {
  const recentActivity = await db.guildDailyActivity.findFirst({
    where: { userId: gameUserId },
    orderBy: { date: 'desc' },
    select: { guildId: true },
  })

  const guildId =
    recentActivity?.guildId ??
    (
      await db.factory.findFirst({
        where: { userId: gameUserId, guildId: { not: null } },
        orderBy: { createdAt: 'desc' },
        select: { guildId: true },
      })
    )?.guildId ??
    null

  if (!guildId) return null

  // 봇이 퇴장한 서버는 맥락으로 쓰지 않는다 — 그 서버의 신뢰도는 더 이상
  // 이 유저의 플레이를 대표하지 않는다.
  const guild = await db.guild.findFirst({
    where: { id: guildId, leftAt: null },
    select: { id: true, name: true },
  })

  return guild ? { guildId: guild.id, name: guild.name } : null
}

/**
 * 서비스 호출에 넘길 `guildId` 만 뽑는다.
 *
 * @param gameUserId 게임 User.id
 */
export async function resolveActiveGuildId(gameUserId: string): Promise<string | null> {
  return (await resolveActiveGuild(gameUserId))?.guildId ?? null
}
