import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { withParams } from '@/lib/href'
import { cn } from '@/lib/utils'
import type { RankingScope } from './RankingTabs'

interface RankingSortProps {
  readonly scope: RankingScope
  readonly active: string
}

/** 정렬 옵션 — 라벨은 `ranking.sort.<value>` 메시지 키가 단일 진실 소스다. */
const SORT_OPTIONS: Record<RankingScope, ReadonlyArray<string>> = {
  users: ['money', 'level'],
  guilds: ['vault', 'weeklyDAU'],
}

/**
 * 정렬 기준 토글 — 링크 기반. 정렬 변경 시 페이지는 1로 리셋(스코프 유지).
 */
export async function RankingSort({
  scope,
  active,
}: RankingSortProps): Promise<React.ReactElement> {
  const t = await getTranslations('ranking.sort')
  const options = SORT_OPTIONS[scope]

  return (
    <div className="flex items-center gap-2">
      <span className="text-ash text-xs">{t('label')}</span>
      <div className="border-hairline flex overflow-hidden rounded border">
        {options.map((value, i) => {
          const selected = value === active
          return (
            <Link
              key={value}
              href={withParams('/ranking', { scope, sort: value })}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'focus-visible:ring-ring px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:-outline-offset-2',
                i > 0 && 'border-hairline border-l',
                selected ? 'bg-elevated text-ink font-medium' : 'text-mute hover:text-body',
              )}
            >
              {t(value)}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
