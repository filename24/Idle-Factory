import { getTranslations } from 'next-intl/server'
import { formatInt } from '@/lib/format'
import { EmptyState } from '@/components/common/EmptyState'
import type { WarehouseSummary } from '@/lib/warehouse-summary'

interface WarehousePanelProps {
  /** 창고 요약. 게임을 시작했지만 창고 행이 없으면 null. */
  readonly summary: WarehouseSummary | null
}

/** 사용률이 이 값 이상이면 경고색으로 전환한다. */
const WARN_PERCENT = 80

/** 사용률이 이 값 이상이면 위험색으로 전환한다 — 생산이 멈추는 지점. */
const FULL_PERCENT = 100

/** 사용률 구간별 진행 바 채움 색. */
function fillColor(percent: number): string {
  if (percent >= FULL_PERCENT) return 'bg-accent-red'
  if (percent >= WARN_PERCENT) return 'bg-accent-orange'
  return 'bg-accent-blue'
}

/**
 * 대시보드 창고 패널 — 사용률 바 + 자재별 재고 표.
 *
 * 봇 `/profile` 과 같은 정보를 웹 프로필에서도 보여준다. 사용률을 눈에 띄게
 * 두는 이유는 창고가 차면 생산이 멈추기 때문이다
 * (`docs/design/05-warehouse.md` §설계 의도).
 *
 * 표시되는 사용량은 개수 합이 아니라 `개수 × 부피 계수` 합(슬롯)이라
 * 아래 표의 수량 합과 일치하지 않는 것이 정상이다.
 *
 * DESIGN.md: 그림자/그라디언트 없이 헤어라인 보더와 배경 명도 차이로만 깊이를
 * 표현하고, 진행 바는 `XpProgress` 와 같은 토큰을 쓴다.
 */
export async function WarehousePanel({
  summary,
}: WarehousePanelProps): Promise<React.ReactElement> {
  const t = await getTranslations('dashboard.me.warehouse')
  const tMaterial = await getTranslations('material')
  const tCommon = await getTranslations('common')

  return (
    <div className="space-y-3">
      <h2 className="font-display text-ink text-lg">{t('title')}</h2>

      {summary === null ? (
        <EmptyState title={t('empty')} description={t('emptyDescription')} />
      ) : (
        <>
          <div className="border-hairline bg-surface flex flex-col gap-2 rounded border p-5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink font-display text-lg">
                {t('grade', { grade: summary.grade })}
              </span>
              <span className="text-mute text-xs tabular-nums">
                {t('usage', {
                  used: formatInt(summary.used),
                  capacity: formatInt(summary.capacity),
                })}
              </span>
            </div>
            <div
              className="bg-elevated h-2 w-full overflow-hidden rounded-full"
              role="progressbar"
              aria-valuenow={summary.usedPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('progressLabel', { percent: summary.usedPercent })}
            >
              <div
                className={`${fillColor(summary.usedPercent)} h-full rounded-full`}
                style={{ width: `${summary.usedPercent}%` }}
              />
            </div>
            <span className="text-ash text-xs">
              {t('freeHint', { free: formatInt(summary.free) })}
            </span>
          </div>

          {summary.stacks.length === 0 ? (
            <EmptyState title={t('empty')} description={t('emptyDescription')} />
          ) : (
            <div className="border-hairline overflow-x-auto rounded border">
              <table className="w-full min-w-[20rem] border-collapse text-sm">
                <thead>
                  <tr className="border-hairline text-mute border-b text-xs">
                    <th scope="col" className="px-4 py-3 text-left font-medium">
                      {t('columns.material')}
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      {t('columns.count')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.stacks.map((stack) => (
                    <tr
                      key={stack.material}
                      className="border-divider-soft hover:bg-surface border-b last:border-0"
                    >
                      <td className="text-body px-4 py-3">{tMaterial(stack.material)}</td>
                      <td className="text-ink px-4 py-3 text-right tabular-nums">
                        {tCommon('count', { count: formatInt(stack.count) })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
