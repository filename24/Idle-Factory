import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Server } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import { getMyDashboard } from '@/lib/queries/my-dashboard'
import { formatInt, formatKoreanCompact } from '@/lib/format'
import { StatTile } from '@/components/dashboard/StatTile'
import { XpProgress } from '@/components/dashboard/XpProgress'
import { EmptyState } from '@/components/common/EmptyState'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export const metadata: Metadata = {
  title: '내 대시보드 · Idle Factory',
  description: '내 자산·레벨·퀘스트 현황과 참여 서버',
}

/** 로그인은 했지만 게임 계정이 없을 때의 안내. */
function NotStarted({ name }: { name?: string | null }): React.ReactElement {
  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState
        title="아직 게임을 시작하지 않았습니다."
        description={`${name ? `${name}님, ` : ''}Discord에서 봇 명령으로 공장을 건설하면 이곳에 자산·레벨·퀘스트 현황이 표시됩니다.`}
      >
        <Link
          href="/docs"
          className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
        >
          게임 시작 가이드 보기
        </Link>
      </EmptyState>
    </section>
  )
}

/**
 * 내 대시보드 — 인증 필요. 미로그인 시 /login 리다이렉트, 로그인했으나 게임 계정이
 * 없으면 시작 안내. 자산·레벨·XP 진행도·퀘스트 현황·참여 서버를 렌더한다.
 * 근거: #20 §내 대시보드. getSession/redirect 실패는 error.tsx 경계가 처리한다.
 */
export default async function MyDashboardPage(): Promise<React.ReactElement> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/login?callbackUrl=/dashboard/me')

  const gameUserId = await resolveGameUserId(session.user.id)
  const data = gameUserId ? await getMyDashboard(gameUserId) : null

  if (!data) return <NotStarted name={session.user.name} />

  const displayName = data.nickname?.trim() || session.user.name || '플레이어'

  return (
    <section
      aria-labelledby="me-heading"
      className="mx-auto max-w-3xl space-y-8 px-4 py-10 sm:px-6"
    >
      <header className="flex items-center gap-4">
        <Avatar size="lg" className="ring-hairline-strong ring-1">
          <AvatarImage src={session.user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-elevated text-ink">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-ash text-xs tracking-wide uppercase">내 대시보드</p>
          <h1 id="me-heading" className="font-display text-ink truncate text-2xl break-keep">
            {displayName}
          </h1>
        </div>
      </header>

      <div className="border-hairline bg-surface rounded border p-5">
        <XpProgress
          level={data.level}
          xpInLevel={data.xpInLevel}
          xpRequired={data.xpRequired}
          percent={data.xpPercent}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="보유 자산"
          value={`${formatKoreanCompact(data.money)}원`}
          hint={`${formatInt(data.money)}원`}
        />
        <StatTile label="진행 중 퀘스트" value={`${formatInt(data.quests.inProgress)}개`} />
        <StatTile
          label="수령 대기"
          value={`${formatInt(data.quests.completed)}개`}
          hint="완료·미수령"
          valueClassName={data.quests.completed > 0 ? 'text-accent-orange' : undefined}
        />
        <StatTile label="완료 퀘스트" value={`${formatInt(data.quests.claimed)}개`} />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-ink text-lg">참여 서버</h2>
        {data.guilds.length === 0 ? (
          <EmptyState
            title="참여 중인 서버가 없습니다."
            description="공장을 건설하거나 활동한 서버가 여기에 표시됩니다."
          />
        ) : (
          <ul className="border-hairline divide-divider-soft divide-y overflow-hidden rounded border">
            {data.guilds.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/dashboard/${g.id}`}
                  className="hover:bg-surface focus-visible:ring-ring flex items-center gap-3 px-4 py-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:-outline-offset-2"
                >
                  <Server aria-hidden="true" className="text-mute size-4 shrink-0" />
                  <span className="text-body min-w-0 flex-1 truncate">
                    {g.name?.trim() || '(이름 없음)'}
                  </span>
                  <span className="text-ash text-xs">통계 보기 →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
