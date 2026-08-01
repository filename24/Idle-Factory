'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { harvestAllAction } from '@/app/dashboard/me/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { formatInt } from '@/lib/format'
import type { MutationResult } from '@/lib/mutation'

/**
 * 전체 공장 일괄 수확 버튼.
 *
 * ## 낙관적 갱신을 쓰지 않는 이유
 *
 * 수확 결과는 클라이언트가 예측할 수 없다 — 창고 여유분에 따라 생산량이
 * 잘리고, 특수 슬롯·인접 시너지 배수가 공장마다 다르며, 희귀 자재 드롭은
 * 난수다. 추정치를 먼저 보여 주면 서버 응답과 어긋나 "숫자가 바뀌는" 것처럼
 * 보인다. 대기 상태만 표시하고 실제 결과로 채운다.
 */

/** 서버가 돌려주는 수확 요약 — 필요한 필드만 좁혀 쓴다. */
interface HarvestSummary {
  readonly factories?: readonly { readonly ticksRealized?: number }[]
  readonly xpGained?: string | number
  readonly leveledUp?: boolean
  readonly newLevel?: number
}

type HarvestState = MutationResult<HarvestSummary> | null

export function HarvestAllButton(): React.ReactElement {
  const t = useTranslations('harvest')
  const tRoot = useTranslations()

  const [state, formAction, pending] = useActionState<HarvestState, FormData>(
    async () => (await harvestAllAction()) as MutationResult<HarvestSummary>,
    null,
  )

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <Button type="submit" disabled={pending}>
          {pending ? t('harvesting') : t('harvestAll')}
        </Button>
      </form>

      {state && !state.ok && (
        <Alert variant="destructive" aria-live="polite">
          <AlertDescription>{tRoot(state.messageKey)}</AlertDescription>
        </Alert>
      )}

      {state?.ok && <HarvestResult summary={state.data} />}
    </div>
  )
}

/** 수확 결과 요약. */
function HarvestResult({ summary }: { readonly summary: HarvestSummary }): React.ReactElement {
  const t = useTranslations('harvest')

  const harvested = (summary.factories ?? []).filter((f) => (f.ticksRealized ?? 0) > 0).length

  if (harvested === 0) {
    return (
      <Alert aria-live="polite">
        <AlertDescription>{t('nothingToHarvest')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert aria-live="polite">
      <AlertTitle>{t('done.title', { count: harvested })}</AlertTitle>
      <AlertDescription className="space-y-1">
        {summary.xpGained !== undefined && (
          <p>{t('done.xp', { amount: formatInt(summary.xpGained) })}</p>
        )}
        {summary.leveledUp && (
          <p className="text-accent-orange">
            {t('done.levelUp', { newLevel: summary.newLevel ?? 0 })}
          </p>
        )}
      </AlertDescription>
    </Alert>
  )
}
