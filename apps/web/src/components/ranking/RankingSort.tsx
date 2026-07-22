import Link from 'next/link'
import { withParams } from '@/lib/href'
import { cn } from '@/lib/utils'
import type { RankingScope } from './RankingTabs'

interface SortOption {
  readonly value: string
  readonly label: string
}

interface RankingSortProps {
  readonly scope: RankingScope
  readonly active: string
}

const SORT_OPTIONS: Record<RankingScope, ReadonlyArray<SortOption>> = {
  users: [
    { value: 'money', label: '보유 자산' },
    { value: 'level', label: '레벨' },
  ],
  guilds: [
    { value: 'vault', label: '금고' },
    { value: 'weeklyDAU', label: '주간 활동' },
  ],
}

/**
 * 정렬 기준 토글 — 링크 기반. 정렬 변경 시 페이지는 1로 리셋(스코프 유지).
 */
export function RankingSort({ scope, active }: RankingSortProps): React.ReactElement {
  const options = SORT_OPTIONS[scope]
  return (
    <div className="flex items-center gap-2">
      <span className="text-ash text-xs">정렬</span>
      <div className="border-hairline flex overflow-hidden rounded border">
        {options.map((opt, i) => {
          const selected = opt.value === active
          return (
            <Link
              key={opt.value}
              href={withParams('/ranking', { scope, sort: opt.value })}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'focus-visible:ring-ring px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:-outline-offset-2',
                i > 0 && 'border-hairline border-l',
                selected ? 'bg-elevated text-ink font-medium' : 'text-mute hover:text-body',
              )}
            >
              {opt.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
