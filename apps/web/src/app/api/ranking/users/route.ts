import { getUserRanking } from '@/lib/queries/rankings'
import { ok, fail } from '@/app/api/_lib/http'

// searchParams(request.url)를 읽으므로 라우트는 동적. 60초 캐싱은 쿼리 계층의
// unstable_cache(RANKING_REVALIDATE_SECONDS)가 담당한다.
export const dynamic = 'force-dynamic'

/**
 * GET /api/ranking/users?sort=money|level&page=1
 * 유저 랭킹 (money 또는 level 기준, 20개 페이지네이션). BigInt 는 문자열로 직렬화됨.
 *
 * 프라이버시: 공개 엔드포인트이므로 유저 식별자(id = Discord snowflake)는 응답에서
 * 제거한다. 본인 행 하이라이트는 페이지가 서버측 세션으로 처리하므로 API 에 id 가 불필요하다.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(request.url)
    const result = await getUserRanking(searchParams.get('sort'), searchParams.get('page'))
    const publicEntries = result.entries.map(({ id: _id, ...rest }) => rest)
    return ok({ ...result, entries: publicEntries })
  } catch (error) {
    console.error('[api/ranking/users] 조회 실패:', error)
    return fail('유저 랭킹을 불러오지 못했습니다.', 500)
  }
}
