import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { Map, Server } from 'lucide-react'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import { getMyDashboard } from '@/lib/queries/my-dashboard'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCompact, formatInt } from '@/lib/format'
import { isLocale } from '@/i18n/config'
import { HarvestAllButton } from '@/components/game/HarvestAllButton'
import { QuestSection } from '@/components/dashboard/QuestSection'
import { StatTile } from '@/components/dashboard/StatTile'
import { WarehousePanel } from '@/components/dashboard/WarehousePanel'
import { XpProgress } from '@/components/dashboard/XpProgress'
import { EmptyState } from '@/components/common/EmptyState'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.me.meta')
  return { title: t('title'), description: t('description') }
}

/** 로그인은 했지만 게임 계정이 없을 때의 안내. */
async function NotStarted({ name }: { name?: string | null }): Promise<React.ReactElement> {
  const t = await getTranslations('dashboard.me.notStarted')
  // 인사말은 로케일마다 붙는 자리가 달라서(한국어는 "~님,", 영어는 "Name,")
  // 본문 안의 {name} 자리에 통째로 끼워 넣는다. 이름이 없으면 빈 문자열.
  const greeting = name ? t('greeting', { name }) : ''

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <EmptyState title={t('title')} description={t('description', { name: greeting })}>
        <Link
          href="/docs"
          className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
        >
          {t('action')}
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

  const t = await getTranslations('dashboard.me')
  const tCommon = await getTranslations('common')
  const raw = await getLocale()
  const locale = isLocale(raw) ? raw : 'ko'

  const displayName = data.nickname?.trim() || session.user.name || t('fallbackName')

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
          <p className="text-ash text-xs tracking-wide uppercase">{t('eyebrow')}</p>
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
          label={t('tiles.money')}
          value={tCommon('money', { amount: formatCompact(data.money, locale) })}
          hint={tCommon('money', { amount: formatInt(data.money) })}
        />
        <StatTile
          label={t('tiles.questsInProgress')}
          value={tCommon('count', { count: formatInt(data.quests.inProgress) })}
        />
        <StatTile
          label={t('tiles.questsCompleted')}
          value={tCommon('count', { count: formatInt(data.quests.completed) })}
          hint={t('tiles.questsCompletedHint')}
          valueClassName={data.quests.completed > 0 ? 'text-accent-orange' : undefined}
        />
        <StatTile
          label={t('tiles.questsClaimed')}
          value={tCommon('count', { count: formatInt(data.quests.claimed) })}
        />
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-ink text-lg">{t('assets.title')}</h2>
        <HarvestAllButton />
        <Link
          href="/dashboard/me/land"
          className="border-hairline hover:bg-surface focus-visible:ring-ring flex items-center gap-3 rounded border px-4 py-3 text-sm transition-colors outline-none focus-visible:ring-2"
        >
          <Map aria-hidden="true" className="text-mute size-4 shrink-0" />
          <span className="text-body min-w-0 flex-1">{t('assets.land')}</span>
          <span className="text-ash text-xs">{t('assets.view')}</span>
        </Link>
      </div>

      <WarehousePanel summary={data.warehouse} />

      <QuestSection gameUserId={data.id} />

      <div className="space-y-3">
        <h2 className="font-display text-ink text-lg">{t('guilds.title')}</h2>
        {data.guilds.length === 0 ? (
          <EmptyState title={t('guilds.empty')} description={t('guilds.emptyDescription')} />
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
                    {g.name?.trim() || tCommon('noName')}
                  </span>
                  <span className="text-ash text-xs">{t('guilds.viewStats')}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
