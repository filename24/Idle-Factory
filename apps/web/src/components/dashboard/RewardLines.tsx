import { useTranslations } from 'next-intl'
import { formatInt } from '@/lib/format'
import type { RewardLineDto } from '@/lib/queries/quests'

/**
 * 보상 라인 목록.
 *
 * 보상 미리보기(퀘스트 카드)와 수령 결과(클라이언트 알림) 양쪽에서 쓴다.
 * `useTranslations` 는 서버·클라이언트 모두에서 동작하므로 컴포넌트를 나누지
 * 않는다.
 */

interface RewardLinesProps {
  readonly rewards: readonly RewardLineDto[]
  /** 지급 결과로 쓸 때 `+` 강조를 켠다. */
  readonly emphasize?: boolean
}

export function RewardLines({ rewards, emphasize = false }: RewardLinesProps): React.ReactElement {
  const t = useTranslations('quest.reward')
  const tCommon = useTranslations('common')

  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {rewards.map((reward, index) => {
        const amount = formatInt(reward.amount)
        const label =
          reward.kind === 'MONEY'
            ? t('money', { amount: tCommon('money', { amount }) })
            : reward.kind === 'XP'
              ? t('xp', { amount })
              : t('material', { amount, material: reward.material ?? '' })

        return (
          <li
            key={`${reward.kind}-${reward.material ?? ''}-${index}`}
            className={
              emphasize
                ? 'text-accent-orange font-medium tabular-nums'
                : 'text-ash text-xs tabular-nums'
            }
          >
            {label}
          </li>
        )
      })}
    </ul>
  )
}
