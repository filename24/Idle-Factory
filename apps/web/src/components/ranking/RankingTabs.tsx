import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { withParams } from '@/lib/href'
import { cn } from '@/lib/utils'

/** 랭킹 스코프 (유저 / 서버). */
export type RankingScope = 'users' | 'guilds'

interface RankingTabsProps {
  readonly active: RankingScope
}

/** 탭 구성 — 라벨은 `ranking.tabs.<scope>` 메시지 키가 단일 진실 소스다. */
const TABS: ReadonlyArray<RankingScope> = ['users', 'guilds']

/**
 * 랭킹 스코프 탭 — 링크 기반(SSR·공유 가능 URL). 스코프 전환 시 정렬/페이지는
 * 기본값으로 리셋된다. role=tablist/tab + aria-selected 로 접근성 확보.
 */
export async function RankingTabs({ active }: RankingTabsProps): Promise<React.ReactElement> {
  const t = await getTranslations('ranking')

  return (
    <div role="tablist" aria-label={t('tabsLabel')} className="border-hairline flex gap-1 border-b">
      {TABS.map((scope) => {
        const selected = scope === active
        return (
          <Link
            key={scope}
            role="tab"
            aria-selected={selected}
            href={withParams('/ranking', { scope })}
            className={cn(
              'focus-visible:ring-ring focus-visible:ring-offset-canvas -mb-px rounded-t border-b-2 px-4 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              selected
                ? 'border-accent-blue text-ink font-medium'
                : 'text-mute hover:text-body border-transparent',
            )}
          >
            {t(`tabs.${scope}`)}
          </Link>
        )
      })}
    </div>
  )
}
