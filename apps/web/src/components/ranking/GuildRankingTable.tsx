import Link from 'next/link'
import { getCreditTier } from '@idle/game-core'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCompact, formatInt } from '@/lib/format'
import { creditTierColorClass } from '@/lib/credit-label'
import { isLocale } from '@/i18n/config'
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
export async function GuildRankingTable({
  entries,
}: GuildRankingTableProps): Promise<React.ReactElement> {
  const t = await getTranslations('ranking')
  const tCredit = await getTranslations('credit.tier')
  const tMoney = await getTranslations('common')
  const raw = await getLocale()
  const locale = isLocale(raw) ? raw : 'ko'

  return (
    <div className="border-hairline overflow-x-auto rounded border">
      <table className="w-full min-w-[32rem] border-collapse text-sm">
        <thead>
          <tr className="border-hairline text-mute border-b text-xs">
            <th scope="col" className="w-16 px-4 py-3 text-right font-medium">
              {t('columns.rank')}
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium">
              {t('columns.server')}
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium">
              {t('columns.vault')}
            </th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
              {t('columns.weeklyDAU')}
            </th>
            <th scope="col" className="w-24 px-4 py-3 text-right font-medium">
              {t('columns.credit')}
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
                    {e.name?.trim() || t('noName')}
                  </Link>
                </td>
                <td
                  className="text-ink px-4 py-3 text-right tabular-nums"
                  title={tMoney('money', { amount: formatInt(e.vault) })}
                >
                  {tMoney('money', { amount: formatCompact(e.vault, locale) })}
                </td>
                <td className="text-body px-4 py-3 text-right tabular-nums">
                  {formatInt(e.weeklyDAU)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  <span className={creditTierColorClass(tier)}>{tCredit(tier)}</span>
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
