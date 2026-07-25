import Link from 'next/link'
import { withParams } from '@/lib/href'
import { cn } from '@/lib/utils'

/** 랭킹 스코프 (유저 / 서버). */
export type RankingScope = 'users' | 'guilds'

interface RankingTabsProps {
  readonly active: RankingScope
}

const TABS: ReadonlyArray<{ scope: RankingScope; label: string }> = [
  { scope: 'users', label: '유저 랭킹' },
  { scope: 'guilds', label: '서버 랭킹' },
]

/**
 * 랭킹 스코프 탭 — 링크 기반(SSR·공유 가능 URL). 스코프 전환 시 정렬/페이지는
 * 기본값으로 리셋된다. role=tablist/tab + aria-selected 로 접근성 확보.
 */
export function RankingTabs({ active }: RankingTabsProps): React.ReactElement {
  return (
    <div role="tablist" aria-label="랭킹 종류" className="border-hairline flex gap-1 border-b">
      {TABS.map(({ scope, label }) => {
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
            {label}
          </Link>
        )
      })}
    </div>
  )
}
