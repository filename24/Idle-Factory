import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import {
  getUserRanking,
  getGuildRanking,
  normalizeUserSort,
  normalizeGuildSort,
  normalizePage,
} from '@/lib/queries/rankings'
import { formatInt } from '@/lib/format'
import { RankingTabs, type RankingScope } from '@/components/ranking/RankingTabs'
import { RankingSort } from '@/components/ranking/RankingSort'
import { UserRankingTable } from '@/components/ranking/UserRankingTable'
import { GuildRankingTable } from '@/components/ranking/GuildRankingTable'
import { Pagination } from '@/components/ranking/Pagination'
import { EmptyState } from '@/components/common/EmptyState'

export const metadata: Metadata = {
  title: '랭킹 · Idle Factory',
  description: '전 서버 유저·서버 순위 — 보유 자산·레벨·금고·주간 활동 기준',
}

interface Props {
  searchParams: Promise<{ scope?: string; sort?: string; page?: string }>
}

function toScope(value?: string): RankingScope {
  return value === 'guilds' ? 'guilds' : 'users'
}

/** 페이지 범위를 벗어났을 때의 안내 (1페이지로 복귀 링크 포함). */
function OutOfRange({ scope, sort }: { scope: RankingScope; sort: string }): React.ReactElement {
  return (
    <EmptyState
      title="이 페이지에는 표시할 항목이 없습니다."
      description="페이지 번호가 범위를 벗어났습니다."
    >
      <Link
        href={`/ranking?scope=${scope}&sort=${sort}`}
        className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
      >
        첫 페이지로 이동
      </Link>
    </EmptyState>
  )
}

/**
 * 랭킹 페이지 — 유저/서버 탭, 정렬 토글, 테이블, 페이지네이션.
 *
 * 링크 기반 탭·정렬로 SSR·공유 가능 URL을 유지한다. 무거운 집계는 쿼리 계층에서
 * 60초 캐시(#20 §캐싱)하고, 로그인 세션이 있으면 본인 행을 하이라이트한다.
 * searchParams 를 읽으므로 라우트는 동적이며 세션 조회 실패에도 페이지는 정상 렌더된다.
 */
export default async function RankingPage({ searchParams }: Props): Promise<React.ReactElement> {
  const sp = await searchParams
  const scope = toScope(sp.scope)
  const page = normalizePage(sp.page)

  let panel: React.ReactNode
  if (scope === 'users') {
    const sort = normalizeUserSort(sp.sort)
    const result = await getUserRanking(sort, page)

    // 본인 하이라이트용 게임 유저 id — 미로그인은 정상(session null). 세션/DB 조회가
    // 실제로 throw 하면(예: env·연결 오류) 하이라이트만 생략하고 페이지는 계속 렌더하되
    // 원인 파악을 위해 로깅한다(무음 삼킴 방지).
    let highlightId: string | null = null
    try {
      const session = await auth.api.getSession({ headers: await headers() })
      if (session?.user) highlightId = await resolveGameUserId(session.user.id)
    } catch (error) {
      console.error('[ranking] 세션 조회 실패 — 본인 하이라이트 생략:', error)
      highlightId = null
    }

    panel = (
      <>
        <div className="my-4 flex justify-end">
          <RankingSort scope="users" active={sort} />
        </div>
        {result.total === 0 ? (
          <EmptyState
            title="아직 랭킹에 오른 유저가 없습니다."
            description="Discord에서 봇으로 게임을 시작하면 랭킹에 등록됩니다."
          />
        ) : result.entries.length === 0 ? (
          <OutOfRange scope="users" sort={sort} />
        ) : (
          <div className="space-y-6">
            <UserRankingTable entries={result.entries} highlightId={highlightId} />
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              params={{ scope: 'users', sort }}
            />
            <p className="text-ash text-center text-xs">총 {formatInt(result.total)}명</p>
          </div>
        )}
      </>
    )
  } else {
    const sort = normalizeGuildSort(sp.sort)
    const result = await getGuildRanking(sort, page)
    panel = (
      <>
        <div className="my-4 flex justify-end">
          <RankingSort scope="guilds" active={sort} />
        </div>
        {result.total === 0 ? (
          <EmptyState
            title="아직 랭킹에 오른 서버가 없습니다."
            description="봇이 참여 중인 서버가 활동을 시작하면 랭킹에 등록됩니다."
          />
        ) : result.entries.length === 0 ? (
          <OutOfRange scope="guilds" sort={sort} />
        ) : (
          <div className="space-y-6">
            <GuildRankingTable entries={result.entries} />
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              params={{ scope: 'guilds', sort }}
            />
            <p className="text-ash text-center text-xs">총 {formatInt(result.total)}개 서버</p>
          </div>
        )}
      </>
    )
  }

  return (
    <section aria-labelledby="ranking-heading" className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6 space-y-1">
        <h1 id="ranking-heading" className="font-display text-ink text-3xl break-keep">
          랭킹
        </h1>
        <p className="text-mute text-sm break-keep">전 서버 유저·서버 순위</p>
      </header>
      <RankingTabs active={scope} />
      <div role="tabpanel">{panel}</div>
    </section>
  )
}
