import { getGuildStats } from '@/lib/queries/guild-stats'
import { ok, fail } from '@/app/api/_lib/http'

/** 세그먼트 캐시(초) — 통계 쿼리 캐시(GUILD_STATS_REVALIDATE_SECONDS=60)와 정렬. Next는 리터럴만 허용. */
export const revalidate = 60

/**
 * GET /api/guilds/[id]
 * 서버 통계 (금고·세율·신뢰도·DAU 추이·주간 정산 히스토리). 없거나 형식 오류면 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params
    const stats = await getGuildStats(id)
    if (!stats) return fail('서버를 찾을 수 없습니다.', 404)
    return ok(stats)
  } catch (error) {
    console.error('[api/guilds/[id]] 조회 실패:', error)
    return fail('서버 통계를 불러오지 못했습니다.', 500)
  }
}
