import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { auth } from '@/lib/auth'
import { resolveGameUserId } from '@/lib/game-user'
import { getMyLand } from '@/lib/queries/my-land'
import { LandGrid } from '@/components/land/LandGrid'
import { StatTile } from '@/components/dashboard/StatTile'
import { cn } from '@/lib/utils'

/**
 * 내 토지 상세 — 4×4 그리드.
 *
 * 토지 번호를 **경로 세그먼트**로 둔 이유는 이전/다음 이동이 평범한 `<Link>` 가
 * 되어 클라이언트 JS 없이 동작하고, 북마크·공유가 가능하며, 보유하지 않은
 * 번호를 `notFound()` 로 자연스럽게 처리할 수 있어서다.
 *
 * 인증 검사를 layout 이 아니라 이 페이지에서 하는 것도 의도적이다 — layout 은
 * 클라이언트 내비게이션 시 다시 실행되지 않으므로 인증 경계로 쓰면 안 된다.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('land.meta')
  return { title: t('title'), description: t('description') }
}

interface LandPageProps {
  readonly params: Promise<{ index: string }>
}

export default async function MyLandPage({ params }: LandPageProps): Promise<React.ReactElement> {
  const { index: rawIndex } = await params

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect(`/login?callbackUrl=/dashboard/me/land/${rawIndex}`)

  const index = Number(rawIndex)
  if (!Number.isInteger(index)) notFound()

  const gameUserId = await resolveGameUserId(session.user.id)
  if (!gameUserId) notFound()

  const land = await getMyLand(gameUserId, index)
  if (!land) notFound()

  const t = await getTranslations('land')
  const tCommon = await getTranslations('common')

  return (
    <section
      aria-labelledby="land-heading"
      className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6"
    >
      <header className="space-y-1">
        <Link href="/dashboard/me" className="text-ash hover:text-ink text-xs transition-colors">
          ← {t('backToDashboard')}
        </Link>
        <h1 id="land-heading" className="font-display text-ink text-2xl">
          {t('title', { index: land.index })}
        </h1>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <StatTile
          label={t('tiles.factories')}
          value={tCommon('count', { count: land.factoryCount })}
        />
        <StatTile
          label={t('tiles.unlocked')}
          value={tCommon('count', { count: land.unlockedCount })}
        />
        <StatTile label={t('tiles.locked')} value={tCommon('count', { count: land.lockedCount })} />
      </div>

      <LandGrid cells={land.cells} landIndex={land.index} />

      {land.ownedIndices.length > 1 && (
        <nav aria-label={t('navLabel')} className="flex items-center justify-between gap-3">
          <LandNavLink index={land.prevIndex} direction="prev" label={t('prev')} />
          <span className="text-ash text-xs tabular-nums">
            {t('position', {
              position: land.ownedIndices.indexOf(land.index) + 1,
              total: land.ownedIndices.length,
            })}
          </span>
          <LandNavLink index={land.nextIndex} direction="next" label={t('next')} />
        </nav>
      )}
    </section>
  )
}

/** 이전/다음 토지 링크. 끝에 도달하면 비활성 표시로 대체한다. */
function LandNavLink({
  index,
  direction,
  label,
}: {
  readonly index: number | null
  readonly direction: 'prev' | 'next'
  readonly label: string
}): React.ReactElement {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight
  const classes = 'flex items-center gap-1 rounded border px-3 py-1.5 text-sm transition-colors'

  if (index === null) {
    return (
      <span
        aria-disabled="true"
        className={cn(classes, 'border-divider-soft text-mute opacity-50')}
      >
        {direction === 'prev' && <Icon aria-hidden="true" className="size-4" />}
        {label}
        {direction === 'next' && <Icon aria-hidden="true" className="size-4" />}
      </span>
    )
  }

  return (
    <Link
      href={`/dashboard/me/land/${index}`}
      className={cn(
        classes,
        'border-hairline text-body hover:bg-surface focus-visible:ring-ring outline-none focus-visible:ring-2',
      )}
    >
      {direction === 'prev' && <Icon aria-hidden="true" className="size-4" />}
      {label}
      {direction === 'next' && <Icon aria-hidden="true" className="size-4" />}
    </Link>
  )
}
