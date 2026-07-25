import Link from 'next/link'
import { getCreditTier } from '@idle/game-core'
import { formatInt, formatKoreanCompact } from '@/lib/format'
import { creditTierLabel, creditTierColorClass } from '@/lib/credit-label'
import { cn } from '@/lib/utils'
import type { GuildRankEntry } from '@/lib/queries/rankings'

interface GuildRankingTableProps {
  readonly entries: readonly GuildRankEntry[]
}

/** 상위 3위 순위 색상. */
function rankColor(rank: number): string {
  if (rank === 1) return 'text-accent-yellow'
  if (rank === 2) return 'text-charcoal'
  if (rank === 3) return 'text-accent-orange'
  return 'text-mute'
}

/** 서버 랭킹 테이블 — 순위·서버명(대시보드 링크)·금고·주간 활동·신뢰도. */
export function GuildRankingTable({ entries }: GuildRankingTableProps): React.ReactElement {
  return (
    <div className="border-hairline overflow-x-auto rounded border">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-hairline text-mute border-b text-xs">
            <th scope="col" className="w-16 px-4 py-3 text-right font-medium">
              순위
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium">
              서버
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              금고
            </th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
              주간 활동
            </th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
              신뢰도
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const tier = getCreditTier(e.credit)
            return (
              <tr
                key={e.id}
                className="border-divider-soft hover:bg-surface border-b last:border-0"
              >
                <td
                  className={cn('px-4 py-3 text-right font-medium tabular-nums', rankColor(e.rank))}
                >
                  {e.rank}
                </td>
                <td className="max-w-[12rem] truncate px-4 py-3">
                  <Link
                    href={`/dashboard/${e.id}`}
                    className="text-link hover:text-link-hover focus-visible:ring-ring rounded underline-offset-2 outline-none hover:underline focus-visible:ring-2"
                  >
                    {e.name?.trim() || '(이름 없음)'}
                  </Link>
                </td>
                <td
                  className="text-ink px-4 py-3 text-right tabular-nums"
                  title={`${formatInt(e.vault)}원`}
                >
                  {formatKoreanCompact(e.vault)}원
                </td>
                <td className="text-body px-4 py-3 text-right tabular-nums">
                  {formatInt(e.weeklyDAU)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={creditTierColorClass(tier)}>{creditTierLabel(tier)}</span>
                  <span className="text-ash ml-1.5 text-xs">{e.credit}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
