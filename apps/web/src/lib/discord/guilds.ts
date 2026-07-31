import type { PartialGuild } from './permissions'

/**
 * 유저의 Discord 길드 목록 조회 + 캐시.
 *
 * ## 캐시는 선택이 아니라 필수다
 *
 * `GET /users/@me/guilds` 는 베어러 토큰당 제한이 매우 빡빡하다(통상 30초에
 * 1회). 서버 설정 페이지를 여는 것만으로도 여러 번 판정이 일어나므로, 캐시
 * 없이는 정상 사용에서도 429 를 맞는다.
 *
 * ## 실패는 항상 거부로 떨어진다
 *
 * Discord 가 죽었을 때 "일단 통과"시키면 그게 곧 인가 우회다. 조회에 실패하고
 * 쓸 만한 캐시도 없으면 `null` 을 돌려주고, 호출 측은 그것을 **거부**로
 * 처리해야 한다. 장애가 요청 증폭으로 번지지 않도록 실패도 짧게 캐시한다.
 *
 * 캐시는 프로세스 메모리에 둔다. 웹이 단일 컨테이너로 배포되는 현재 구성에서는
 * 충분하지만, replica 를 늘리면 replica 수만큼 Discord 호출이 늘어난다.
 */

/** 성공 응답 캐시 TTL(ms). */
const CACHE_TTL_MS = 60_000
/** 실패 응답 캐시 TTL(ms) — 장애 시 요청 증폭 방지. */
const NEGATIVE_TTL_MS = 10_000
/** Discord API 호출 타임아웃(ms). */
const FETCH_TIMEOUT_MS = 5_000

interface CacheEntry {
  readonly expiresAt: number
  readonly guilds: readonly PartialGuild[] | null
}

/** authUserId → 길드 목록. 프로세스 메모리. */
const cache = new Map<string, CacheEntry>()

/**
 * 캐시를 비운다. 테스트 전용.
 */
export function clearGuildCache(): void {
  cache.clear()
}

/**
 * 유저의 길드 목록을 가져온다.
 *
 * @param authUserId better-auth 유저 id — 캐시 키
 * @param accessToken Discord 유저 액세스 토큰
 * @param now 현재 시각(ms). 테스트 주입용
 * @returns 길드 목록. 조회 실패 시 `null`(= 거부해야 함)
 */
export async function fetchUserGuilds(
  authUserId: string,
  accessToken: string,
  now: number = Date.now(),
): Promise<readonly PartialGuild[] | null> {
  const cached = cache.get(authUserId)
  if (cached && cached.expiresAt > now) return cached.guilds

  try {
    const response = await fetch('https://discord.com/api/v10/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // 이 응답은 유저마다 다르므로 Next 의 fetch 캐시를 타면 안 된다.
      cache: 'no-store',
    })

    if (!response.ok) {
      // 429 를 포함한 모든 실패. 오래된 캐시라도 있으면 그걸 쓰는 편이
      // 사용자에게 낫다 — 없을 때만 실패를 캐시한다.
      if (cached?.guilds) return cached.guilds
      cache.set(authUserId, { expiresAt: now + NEGATIVE_TTL_MS, guilds: null })
      return null
    }

    const body: unknown = await response.json()
    if (!Array.isArray(body)) {
      cache.set(authUserId, { expiresAt: now + NEGATIVE_TTL_MS, guilds: null })
      return null
    }

    const guilds = body.filter(
      (entry): entry is PartialGuild =>
        entry !== null &&
        typeof entry === 'object' &&
        typeof (entry as PartialGuild).id === 'string',
    )

    cache.set(authUserId, { expiresAt: now + CACHE_TTL_MS, guilds })
    return guilds
  } catch {
    if (cached?.guilds) return cached.guilds
    cache.set(authUserId, { expiresAt: now + NEGATIVE_TTL_MS, guilds: null })
    return null
  }
}

/**
 * 길드 목록에서 특정 서버를 찾는다.
 *
 * @param guilds 길드 목록
 * @param guildId 찾을 서버 id
 */
export function findGuild(
  guilds: readonly PartialGuild[] | null,
  guildId: string,
): PartialGuild | null {
  return guilds?.find((guild) => guild.id === guildId) ?? null
}
