import { buildHealthPayload } from '@/lib/health'
import { ok } from '@/app/api/_lib/http'

// 프리렌더되면 uptime 이 빌드 시점 값으로 굳어 프로브가 무의미해진다.
export const dynamic = 'force-dynamic'

/**
 * GET /api/health — 컨테이너 오케스트레이터용 liveness 프로브.
 *
 * compose.prod.yml 의 web healthcheck 가 이 경로를 호출한다.
 * DB 를 건드리지 않는 이유는 `buildHealthPayload` 주석 참고.
 */
export function GET(): Response {
  return ok(buildHealthPayload(process.uptime(), process.env.BUILD_NUMBER), {
    // 프록시·CDN 이 프로브 응답을 캐싱하면 죽은 프로세스가 계속 200 으로 보인다.
    headers: { 'Cache-Control': 'no-store' },
  })
}
