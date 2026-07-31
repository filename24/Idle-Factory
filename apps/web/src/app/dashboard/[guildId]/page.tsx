import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGuildStats } from '@/lib/queries/guild-stats'
import { getLocale, getTranslations } from 'next-intl/server'
import { formatCompact, formatInt, formatPercent } from '@/lib/format'
import { creditTierColorClass } from '@/lib/credit-label'
import { isLocale } from '@/i18n/config'
import { StatTile } from '@/components/dashboard/StatTile'
import { BarChart, type BarDatum } from '@/components/charts/BarChart'
import { EmptyState } from '@/components/common/EmptyState'

interface Props {
  params: Promise<{ guildId: string }>
}

/** ISO 날짜 문자열 → "MM/DD" 짧은 라벨. */
function shortDate(iso: string): string {
  return iso.slice(5, 10).replace('-', '/')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { guildId } = await params
  const stats = await getGuildStats(guildId)
  const t = await getTranslations('dashboard.guild.meta')
  if (!stats) return { title: t('notFound') }
  return {
    title: t('title', { name: stats.name }),
    description: t('description', { name: stats.name }),
  }
}

/**
 * 서버별 통계 대시보드 — 공개 페이지.
 *
 * 서버명·금고·주간 활동·가산세·신뢰도·공장 수 타일 + DAU 추이(막대) +
 * 주간 정산 히스토리(막대·테이블)를 렌더한다. 없거나 형식 오류인 서버는 notFound.
 * 근거: #20 §서버별 통계 대시보드.
 */
export default async function GuildDashboardPage({ params }: Props): Promise<React.ReactElement> {
  const { guildId } = await params
  const stats = await getGuildStats(guildId)
  if (!stats) notFound()

  const t = await getTranslations('dashboard.guild')
  const tCommon = await getTranslations('common')
  const tCredit = await getTranslations('credit.tier')
  const raw = await getLocale()
  const locale = isLocale(raw) ? raw : 'ko'
  const money = (v: bigint | number | string) =>
    tCommon('money', { amount: formatCompact(v, locale) })
  const moneyExact = (v: bigint | number | string) => tCommon('money', { amount: formatInt(v) })

  const dauData: BarDatum[] = stats.dauTrend.map((p) => ({
    label: shortDate(p.date),
    value: p.count,
    display: tCommon('people', { count: formatInt(p.count) }),
  }))

  const settlementData: BarDatum[] = stats.settlements.map((p) => ({
    label: shortDate(p.weekStart),
    value: Number(p.taxPaid),
    display: money(p.taxPaid),
  }))

  return (
    <section
      aria-labelledby="guild-heading"
      className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-ash text-xs tracking-wide uppercase">{t('eyebrow')}</p>
          <h1 id="guild-heading" className="font-display text-ink text-3xl break-keep">
            {stats.name?.trim() || tCommon('noName')}
          </h1>
        </div>
        {/*
          권한 검사 없이 링크만 노출한다. 설정 페이지가 자체적으로 인가하고
          권한이 없으면 안내를 띄우므로, 여기서 Discord 를 조회해 링크를
          숨기는 것은 공개 페이지에 불필요한 외부 호출만 추가하는 일이다.
        */}
        <Link
          href={`/dashboard/${guildId}/settings`}
          className="border-hairline text-ash hover:text-ink hover:bg-surface focus-visible:ring-ring rounded border px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-2"
        >
          {t('manageSettings')}
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label={t('tiles.vault')}
          value={money(stats.vault)}
          hint={moneyExact(stats.vault)}
        />
        <StatTile
          label={t('tiles.weeklyDAU')}
          value={tCommon('people', { count: formatInt(stats.weeklyDAU) })}
          hint={t('tiles.weeklyDAUHint')}
        />
        <StatTile
          label={t('tiles.surcharge')}
          value={formatPercent(stats.taxSurcharge)}
          hint={t('tiles.surchargeHint')}
        />
        <StatTile
          label={t('tiles.credit')}
          value={tCredit(stats.creditTier)}
          hint={`${formatInt(stats.credit)} / 2000`}
          valueClassName={creditTierColorClass(stats.creditTier)}
        />
        <StatTile
          label={t('tiles.factories')}
          value={tCommon('count', { count: formatInt(stats.factoryCount) })}
        />
        <StatTile
          label={t('tiles.totalTax')}
          value={money(stats.totalTaxCollected)}
          hint={moneyExact(stats.totalTaxCollected)}
        />
      </div>

      <div className="border-hairline bg-surface space-y-4 rounded border p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-ink text-lg">{t('dau.title')}</h2>
          <span className="text-ash text-xs">{t('dau.subtitle')}</span>
        </div>
        {dauData.length === 0 ? (
          <EmptyState title={t('dau.empty')} />
        ) : (
          <BarChart data={dauData} color="var(--color-chart-2)" ariaLabel={t('dau.chartLabel')} />
        )}
      </div>

      <div className="border-hairline bg-surface space-y-4 rounded border p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-ink text-lg">{t('settlement.title')}</h2>
          <span className="text-ash text-xs">{t('settlement.subtitle')}</span>
        </div>
        {settlementData.length === 0 ? (
          <EmptyState
            title={t('settlement.empty')}
            description={t('settlement.emptyDescription')}
          />
        ) : (
          <div className="space-y-6">
            <BarChart
              data={settlementData}
              color="var(--color-chart-1)"
              ariaLabel={t('settlement.chartLabel')}
            />
            <div className="border-hairline overflow-x-auto rounded border">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-hairline text-mute border-b text-xs">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      {t('settlement.columns.week')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      {t('settlement.columns.revenue')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      {t('settlement.columns.vaultAdded')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stats.settlements
                    .slice()
                    .reverse()
                    .map((s) => (
                      <tr key={s.weekStart} className="border-divider-soft border-b last:border-0">
                        <td className="text-body px-4 py-2.5 tabular-nums">
                          {s.weekStart.slice(0, 10)}
                        </td>
                        <td
                          className="text-body px-4 py-2.5 text-right tabular-nums"
                          title={moneyExact(s.salesRevenue)}
                        >
                          {money(s.salesRevenue)}
                        </td>
                        <td
                          className="text-ink px-4 py-2.5 text-right tabular-nums"
                          title={moneyExact(s.taxPaid)}
                        >
                          {money(s.taxPaid)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
