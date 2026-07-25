import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGuildStats } from '@/lib/queries/guild-stats'
import { formatInt, formatKoreanCompact, formatPercent } from '@/lib/format'
import { creditTierLabel, creditTierColorClass } from '@/lib/credit-label'
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
  if (!stats) return { title: '서버를 찾을 수 없음 · Idle Factory' }
  return {
    title: `${stats.name} 통계 · Idle Factory`,
    description: `${stats.name} 서버의 금고·세율·신뢰도·활동 통계`,
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

  const dauData: BarDatum[] = stats.dauTrend.map((p) => ({
    label: shortDate(p.date),
    value: p.count,
    display: `${formatInt(p.count)}명`,
  }))

  const settlementData: BarDatum[] = stats.settlements.map((p) => ({
    label: shortDate(p.weekStart),
    value: Number(p.taxPaid),
    display: `${formatKoreanCompact(p.taxPaid)}원`,
  }))

  return (
    <section
      aria-labelledby="guild-heading"
      className="mx-auto max-w-4xl space-y-8 px-4 py-10 sm:px-6"
    >
      <header className="space-y-1">
        <p className="text-ash text-xs tracking-wide uppercase">서버 통계</p>
        <h1 id="guild-heading" className="font-display text-ink text-3xl break-keep">
          {stats.name?.trim() || '(이름 없음)'}
        </h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="금고 잔액"
          value={`${formatKoreanCompact(stats.vault)}원`}
          hint={`${formatInt(stats.vault)}원`}
        />
        <StatTile label="주간 활동" value={`${formatInt(stats.weeklyDAU)}명`} hint="최근 7일 DAU" />
        <StatTile
          label="서버 가산세"
          value={formatPercent(stats.taxSurcharge)}
          hint="기본 누진세에 가산"
        />
        <StatTile
          label="신뢰도"
          value={creditTierLabel(stats.creditTier)}
          hint={`${formatInt(stats.credit)} / 2000`}
          valueClassName={creditTierColorClass(stats.creditTier)}
        />
        <StatTile label="소속 공장" value={`${formatInt(stats.factoryCount)}개`} />
        <StatTile
          label="누적 세수"
          value={`${formatKoreanCompact(stats.totalTaxCollected)}원`}
          hint={`${formatInt(stats.totalTaxCollected)}원`}
        />
      </div>

      <div className="border-hairline bg-surface space-y-4 rounded border p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-ink text-lg">활동 추이</h2>
          <span className="text-ash text-xs">일별 활동 유저 수</span>
        </div>
        {dauData.length === 0 ? (
          <EmptyState title="최근 활동 기록이 없습니다." />
        ) : (
          <BarChart
            data={dauData}
            color="var(--color-chart-2)"
            ariaLabel="일별 활동 유저 수 추이"
          />
        )}
      </div>

      <div className="border-hairline bg-surface space-y-4 rounded border p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-ink text-lg">주간 정산 히스토리</h2>
          <span className="text-ash text-xs">주별 금고 적립 세액</span>
        </div>
        {settlementData.length === 0 ? (
          <EmptyState
            title="주간 정산 내역이 아직 없습니다."
            description="매주 일요일(UTC) 정산이 집계됩니다."
          />
        ) : (
          <div className="space-y-6">
            <BarChart
              data={settlementData}
              color="var(--color-chart-1)"
              ariaLabel="주별 금고 적립 세액 추이"
            />
            <div className="border-hairline overflow-x-auto rounded border">
              <table className="w-full min-w-[24rem] border-collapse text-sm">
                <thead>
                  <tr className="border-hairline text-mute border-b text-xs">
                    <th scope="col" className="px-4 py-2.5 text-left font-medium">
                      정산 주
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      판매 수익
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      금고 적립
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
                          title={`${formatInt(s.salesRevenue)}원`}
                        >
                          {formatKoreanCompact(s.salesRevenue)}원
                        </td>
                        <td
                          className="text-ink px-4 py-2.5 text-right tabular-nums"
                          title={`${formatInt(s.taxPaid)}원`}
                        >
                          {formatKoreanCompact(s.taxPaid)}원
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
