import { formatInt, formatKoreanCompact } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { UserRankEntry } from '@/lib/queries/rankings'

interface UserRankingTableProps {
  readonly entries: readonly UserRankEntry[]
  /** 로그인 유저의 게임 id (본인 행 하이라이트용). */
  readonly highlightId?: string | null
}

/** 상위 3위 순위 색상 (금·은·동 대체 시맨틱). */
function rankColor(rank: number): string {
  if (rank === 1) return 'text-accent-yellow'
  if (rank === 2) return 'text-charcoal'
  if (rank === 3) return 'text-accent-orange'
  return 'text-mute'
}

/** 유저 랭킹 테이블 — 순위·닉네임·레벨·보유 자산. 본인 행 하이라이트. */
export function UserRankingTable({
  entries,
  highlightId,
}: UserRankingTableProps): React.ReactElement {
  return (
    <div className="border-hairline overflow-x-auto rounded border">
      <table className="w-full min-w-[28rem] border-collapse text-sm">
        <thead>
          <tr className="border-hairline text-mute border-b text-xs">
            <th scope="col" className="w-16 px-4 py-3 text-right font-medium">
              순위
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium">
              닉네임
            </th>
            <th scope="col" className="w-20 px-4 py-3 text-right font-medium">
              레벨
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              보유 자산
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const mine = highlightId != null && e.id === highlightId
            return (
              <tr
                key={e.id}
                aria-current={mine ? 'true' : undefined}
                className={cn(
                  'border-divider-soft border-b last:border-0',
                  mine ? 'bg-elevated border-accent-blue border-l-2' : 'hover:bg-surface',
                )}
              >
                <td
                  className={cn('px-4 py-3 text-right font-medium tabular-nums', rankColor(e.rank))}
                >
                  {e.rank}
                </td>
                <td className="text-body max-w-[12rem] truncate px-4 py-3">
                  {e.nickname?.trim() || '(닉네임 없음)'}
                  {mine ? <span className="text-accent-blue ml-2 text-xs">나</span> : null}
                </td>
                <td className="text-body px-4 py-3 text-right tabular-nums">Lv.{e.level}</td>
                <td
                  className="text-ink px-4 py-3 text-right tabular-nums"
                  title={`${formatInt(e.money)}원`}
                >
                  {formatKoreanCompact(e.money)}원
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
