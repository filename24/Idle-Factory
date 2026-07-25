import { getGuildRanking } from '@/lib/queries/rankings'
import { ok, fail } from '@/app/api/_lib/http'

// searchParams(request.url)를 읽으므로 라우트는 동적. 60초 캐싱은 쿼리 계층의
// unstable_cache(RANKING_REVALIDATE_SECONDS)가 담당한다.
export const dynamic = 'force-dynamic'

/**
 * GET /api/ranking/guilds?sort=vault|weeklyDAU&page=1
 * 서버 랭킹 (금고 또는 주간 DAU 기준, 20개 페이지네이션). 봇 퇴장 서버 제외.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)
    const result = await getGuildRanking(searchParams.get('sort'), searchParams.get('page'))
    return ok(result)
  } catch (error) {
    console.error('[api/ranking/guilds] 조회 실패:', error)
    return fail('서버 랭킹을 불러오지 못했습니다.', 500)
  }
}
