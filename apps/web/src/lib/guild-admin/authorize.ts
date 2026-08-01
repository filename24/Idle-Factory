import { headers } from 'next/headers'
import { auth } from '../auth'
import { db } from '../db'
import { fetchUserGuilds, findGuild } from '../discord/guilds'
import { hasManageGuild, hasScope, isValidGuildId } from '../discord/permissions'
import { checkRateLimit } from '../mutation'

/**
 * 서버 관리자 인가 가드.
 *
 * **모든 관리자 읽기·쓰기가 이 함수를 통과해야 한다.** 순서에 의미가 있고,
 * 어느 단계에서 예외가 나든 결과는 거부다(fail closed).
 *
 *  1. `guildId` 형식 검증 — I/O 이전에 막는다.
 *  2. 세션 존재
 *  3. 레이트 리밋 — 외부 호출 이전에 건다.
 *  4. Discord 액세스 토큰 확보
 *  5. `guilds` 스코프 부여 여부 — 스코프 추가 이전에 발급된 세션을 잡는다.
 *  6. 길드 목록 조회 — 실패 시 **절대 통과시키지 않는다.**
 *  7. 멤버십
 *  8. ManageGuild 권한 비트
 *  9. 길드가 등록되어 있고 봇이 남아 있는가
 *
 * ## `NOT_MEMBER` 와 `FORBIDDEN` 은 클라이언트에서 구분되면 안 된다
 *
 * 둘을 다르게 보여 주면 임의의 snowflake 에 대해 "그 서버에 속해 있는가"를
 * 물어보는 오라클이 된다. 메시지와 상태 코드를 같게 유지할 것.
 */

/** 인가 실패 사유. */
export type GuildAdminErrorCode =
  | 'INVALID_GUILD_ID'
  | 'UNAUTHENTICATED'
  /** `guilds` 스코프가 없다 — 재동의 유도. */
  | 'SCOPE_REQUIRED'
  | 'NOT_MEMBER'
  | 'FORBIDDEN'
  /** 봇이 없는(또는 나간) 서버 — 초대 안내. */
  | 'GUILD_NOT_REGISTERED'
  | 'RATE_LIMITED'
  /** Discord 조회 실패 — 통과시키지 않는다. */
  | 'DISCORD_UNAVAILABLE'

/** 인가 결과. */
export type GuildAdminAuthorization =
  | { readonly ok: true; readonly guildId: string; readonly authUserId: string }
  | { readonly ok: false; readonly code: GuildAdminErrorCode; readonly status: number }

/** 실패 코드 → HTTP 상태. */
const STATUS: Readonly<Record<GuildAdminErrorCode, number>> = {
  INVALID_GUILD_ID: 400,
  UNAUTHENTICATED: 401,
  SCOPE_REQUIRED: 403,
  // 멤버가 아닌 것과 권한이 없는 것을 같은 상태로 응답한다(존재 유출 방지).
  NOT_MEMBER: 403,
  FORBIDDEN: 403,
  GUILD_NOT_REGISTERED: 404,
  RATE_LIMITED: 429,
  DISCORD_UNAVAILABLE: 503,
}

/** 실패 결과를 만든다. */
function deny(code: GuildAdminErrorCode): GuildAdminAuthorization {
  return { ok: false, code, status: STATUS[code] }
}

/** Discord 조회 레이트 리밋 — 토큰당 제한이 빡빡해 보수적으로 잡는다. */
const RATE_LIMIT = { bucket: 'guild-admin', limit: 30, windowMs: 60_000 } as const

/**
 * 대상 서버에 대한 관리자 권한을 확인한다.
 *
 * @param guildId 클라이언트가 보낸 서버 id — 신뢰하지 않는다
 * @returns 통과 시 검증된 `guildId`, 아니면 실패 사유
 */
export async function requireGuildAdmin(guildId: unknown): Promise<GuildAdminAuthorization> {
  // 1. 형식 — 어떤 I/O 보다 먼저.
  if (!isValidGuildId(guildId)) return deny('INVALID_GUILD_ID')

  // 2. 세션
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session?.user) return deny('UNAUTHENTICATED')

  const authUserId = session.user.id

  // 3. 레이트 리밋 — 외부 호출 전에.
  const verdict = await checkRateLimit(RATE_LIMIT, authUserId)
  if (!verdict.allowed) return deny('RATE_LIMITED')

  // 4~5. 토큰과 스코프
  let accessToken: string
  try {
    const token = await auth.api.getAccessToken({
      body: { providerId: 'discord' },
      headers: requestHeaders,
    })
    if (!token?.accessToken) return deny('SCOPE_REQUIRED')
    if (!hasScope(token.scopes, 'guilds')) return deny('SCOPE_REQUIRED')
    accessToken = token.accessToken
  } catch {
    // 토큰 갱신 실패는 재동의로 안내한다 — 내부 오류로 뭉개면 유저가
    // 할 수 있는 일이 없어진다.
    return deny('SCOPE_REQUIRED')
  }

  // 6. 길드 목록 — 조회 실패 시 통과 금지.
  const guilds = await fetchUserGuilds(authUserId, accessToken)
  if (guilds === null) return deny('DISCORD_UNAVAILABLE')

  // 7. 멤버십
  const guild = findGuild(guilds, guildId)
  if (!guild) return deny('NOT_MEMBER')

  // 8. 권한 비트
  if (!hasManageGuild(guild)) return deny('FORBIDDEN')

  // 9. 등록 상태 — 봇이 나간 서버는 설정을 바꿔도 반영되지 않는다.
  const row = await db.guild.findFirst({
    where: { id: guildId, leftAt: null },
    select: { id: true },
  })
  if (!row) return deny('GUILD_NOT_REGISTERED')

  return { ok: true, guildId, authUserId }
}
