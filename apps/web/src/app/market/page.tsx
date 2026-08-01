import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { getMarketPriceBoard } from '@/lib/queries/market'
import { formatInt } from '@/lib/format'
import { formatPpm } from '@/lib/market-math'
import { EmptyState } from '@/components/common/EmptyState'

/**
 * 글로벌 마켓 시세 보드.
 *
 * 봇은 Components v2 컨테이너 한도 때문에 몇 줄씩 페이지네이션하지만, 웹은
 * 13종 자재를 한 화면에 표로 보여 줄 수 있다. 이 도메인에서 웹이 실제로 나은
 * 지점이다.
 *
 * 시세는 30분마다 tick 하므로 쿼리 계층에서 5분 캐시한다. 페이지 자체는
 * 로케일 쿠키 때문에 어차피 동적 렌더라 세그먼트 캐시를 걸지 않는다.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('market.meta')
  return { title: t('title'), description: t('description') }
}

export default async function MarketPage(): Promise<React.ReactElement> {
  const board = await getMarketPriceBoard()
  const t = await getTranslations('market')
  const tMaterial = await getTranslations('material')
  const tCommon = await getTranslations('common')

  return (
    <section
      aria-labelledby="market-heading"
      className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6"
    >
      <header className="space-y-1">
        <h1 id="market-heading" className="font-display text-ink text-2xl">
          {t('prices.title')}
        </h1>
        <p className="text-ash text-sm">{t('prices.description')}</p>
      </header>

      {board.entries.length === 0 ? (
        <EmptyState title={t('prices.empty')} description={t('prices.emptyDescription')} />
      ) : (
        <div className="border-hairline overflow-x-auto rounded border">
          <table className="w-full min-w-[32rem] border-collapse text-sm">
            <thead>
              <tr className="border-divider-soft text-ash border-b text-left text-xs">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('prices.material')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('prices.basePrice')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('prices.currentPrice')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('prices.change')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('prices.recentSales')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-divider-soft divide-y">
              {board.entries.map((entry) => {
                const up = entry.changeFromBasePpm > 0
                const down = entry.changeFromBasePpm < 0

                return (
                  <tr key={entry.material}>
                    <th scope="row" className="text-body px-4 py-2 text-left font-normal">
                      {tMaterial(entry.material)}
                    </th>
                    <td className="text-ash px-4 py-2 text-right tabular-nums">
                      {tCommon('money', { amount: formatInt(entry.basePrice) })}
                    </td>
                    <td className="text-ink px-4 py-2 text-right tabular-nums">
                      {tCommon('money', { amount: formatInt(entry.currentPrice) })}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        up ? 'text-accent-orange' : down ? 'text-mute' : 'text-ash'
                      }`}
                    >
                      {up ? '+' : ''}
                      {formatPpm(entry.changeFromBasePpm)}
                    </td>
                    <td className="text-ash px-4 py-2 text-right tabular-nums">
                      {formatInt(entry.recentSales)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-mute text-xs">{t('prices.tickNotice')}</p>
    </section>
  )
}
