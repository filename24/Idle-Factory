'use client'

import { useActionState } from 'react'
import { useTranslations } from 'next-intl'
import { claimQuestAction } from '@/app/dashboard/me/actions'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RewardLines } from './RewardLines'
import type { QuestClaimSuccess } from '@/lib/mutations/quest-claim'
import type { MutationResult } from '@/lib/mutation'

/**
 * 퀘스트 보상 수령 버튼 — 이 화면의 유일한 클라이언트 섬.
 *
 * `useActionState` 를 쓰는 이유는 액션의 **반환값**이 곧 표시할 상태이기
 * 때문이다. 뮤테이션 계층이 실패를 throw 하지 않고 값으로 돌려주도록 설계된
 * 것도 이 훅과 맞물리기 위함이다(`lib/mutation/result.ts` 참고).
 *
 * 성공 응답에는 실제 지급된 보상 라인이 실려 오므로, 낙관적 갱신 없이도
 * "무엇을 받았는지"를 정확히 보여줄 수 있다.
 */

interface QuestClaimButtonProps {
  readonly questId: string
  readonly claimable: boolean
}

/** 액션이 아직 실행되지 않은 초기 상태. */
type ClaimState = MutationResult<QuestClaimSuccess> | null

export function QuestClaimButton({
  questId,
  claimable,
}: QuestClaimButtonProps): React.ReactElement {
  const t = useTranslations('quest')

  const [state, formAction, pending] = useActionState<ClaimState, FormData>(
    async (_prev, formData) => claimQuestAction(formData),
    null,
  )

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="questId" value={questId} />
        <Button type="submit" size="sm" disabled={!claimable || pending}>
          {pending ? t('claiming') : t('claimButton')}
        </Button>
      </form>

      {state && <ClaimResult state={state} />}
    </div>
  )
}

/** 수령 결과 알림. 스크린리더에도 즉시 전달되도록 aria-live 를 건다. */
function ClaimResult({ state }: { readonly state: NonNullable<ClaimState> }): React.ReactElement {
  const t = useTranslations('quest')
  const tErrors = useTranslations()

  if (!state.ok) {
    return (
      <Alert variant="destructive" aria-live="polite">
        <AlertDescription>{tErrors(state.messageKey)}</AlertDescription>
      </Alert>
    )
  }

  const { grants, alreadyClaimed, leveledUp, newLevel, unlocked } = state.data

  if (alreadyClaimed) {
    return (
      <Alert aria-live="polite">
        <AlertDescription>{t('claimed.already')}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert aria-live="polite">
      <AlertTitle>{t('claimed.title')}</AlertTitle>
      <AlertDescription className="space-y-2">
        <RewardLines rewards={grants} emphasize />
        {leveledUp && <p className="text-accent-orange">{t('claimed.levelUp', { newLevel })}</p>}
        {unlocked && <p>{t('unlocked.body', { title: tErrors(unlocked.titleKey) })}</p>}
      </AlertDescription>
    </Alert>
  )
}
