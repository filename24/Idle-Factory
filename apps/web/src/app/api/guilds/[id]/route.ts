import { getGuildStats } from '@/lib/queries/guild-stats'
import { ok, fail } from '@/app/api/_lib/http'
import { checkRateLimit } from '@/lib/mutation'
import { getTranslations } from 'next-intl/server'

/**
 * 이 엔드포인트는 **의도적으로 공개**다.
 *
 * `middleware.ts` 가 명시하듯(#20 §권한: "서버 통계 공개, 개인은 세션 필수"),
 * 금고·세율·신뢰도·DAU 는 서버 단위 집계이지 개인 정보가 아니다. 동일한 데이터를
 * `/dashboard/[guildId]` 페이지가 세션 없이 렌더하므로, API 에만 인증을 붙이는 건
 * 실질 보호 없이 형태만 갖추는 일이다. 이 레포가 실제로 긋는 프라이버시 선은
 * **개인 식별자**이며, 그건 `api/ranking/users/route.ts` 처럼 응답에서 id 를
 * 제거하는 방식으로 지킨다.
 *
 * 관리자 전용 필드(`announceChannelId`, `Guild.lang` 등)는 이 응답에 **절대**
 * 포함하지 않는다. 그런 값이 필요하면 ManageGuild 를 검증하는 별도 경로를 쓸 것.
 *
 * `dynamic = 'force-dynamic'` 인 이유: 이전에는 `revalidate = 60` 이 걸려 있었는데,
 * 쿼리 계층(`guild-stats.ts`)이 이미 `unstable_cache` 로 60초 캐싱을 하고 있어
 * 캐시가 이중이었다. 게다가 세그먼트 캐시가 붙은 핸들러는 나중에 안전하게 인증을
 * 걸 수 없는 함정이 된다 — 응답이 요청자와 무관하게 재사용되기 때문이다.
 * 캐싱 책임은 쿼리 계층 한 곳에 둔다(`api/ranking/*` 와 동일 규약).
 */
export const dynamic = 'force-dynamic'

/** 열거 방지용 IP 레이트 리밋 — 길드 id 는 추측 가능한 snowflake 다. */
const RATE_LIMIT = { bucket: 'api.guilds.get', limit: 60, windowMs: 60_000 } as const

/**
 * 요청자 IP 를 추정한다.
 *
 * 리버스 프록시 뒤에서 동작하므로 `x-forwarded-for` 의 첫 항목을 쓴다.
 * 헤더가 없으면 단일 버킷(`unknown`)으로 묶는다 — 정밀한 식별보다 "무제한
 * 열거를 막는다"가 목적이라 그 정도로 충분하다.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown'
  return request.headers.get('x-real-ip')?.trim() || 'unknown'
}

/**
 * GET /api/guilds/[id]
 * 서버 통계 (금고·세율·신뢰도·DAU 추이·주간 정산 히스토리). 없거나 형식 오류면 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const t = await getTranslations('api.errors')
  try {
    const verdict = await checkRateLimit(RATE_LIMIT, clientIp(request))
    if (!verdict.allowed) return fail(t('rateLimited'), 429)

    const { id } = await params
    const stats = await getGuildStats(id)
    if (!stats) return fail(t('guildNotFound'), 404)
    return ok(stats)
  } catch (error) {
    console.error('[api/guilds/[id]] 조회 실패:', error)
    return fail(t('guildStats'), 500)
  }
}
