import { getTranslations } from 'next-intl/server'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/common/EmptyState'
import { formatInt } from '@/lib/format'
import { getMyQuests, type QuestCardDto } from '@/lib/queries/quests'
import { QuestClaimButton } from './QuestClaimButton'
import { RewardLines } from './RewardLines'

/**
 * 내 퀘스트 목록 섹션.
 *
 * 서버 컴포넌트다 — 카드 본문(제목·설명·진행 바·보상 미리보기)에는 상호작용이
 * 없다. 클라이언트 JS 는 카드마다 붙는 [보상 받기] 버튼 하나뿐이다.
 */

interface QuestSectionProps {
  readonly gameUserId: string
}

export async function QuestSection({ gameUserId }: QuestSectionProps): Promise<React.ReactElement> {
  const data = await getMyQuests(gameUserId)
  const t = await getTranslations('quest')

  return (
    <div className="space-y-3">
      <h2 className="font-display text-ink text-lg">{t('title')}</h2>

      {data.quests.length === 0 ? (
        <EmptyState
          title={data.tutorialComplete ? t('empty.tutorialDone') : t('empty.noVisible')}
          description={
            data.tutorialComplete
              ? t('empty.tutorialDoneDescription', { count: formatInt(data.claimedCount) })
              : t('empty.noVisibleDescription')
          }
        />
      ) : (
        <ul className="space-y-3">
          {data.quests.map((quest) => (
            <li key={quest.questId}>
              <QuestCard quest={quest} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 퀘스트 카드 한 장. */
async function QuestCard({ quest }: { readonly quest: QuestCardDto }): Promise<React.ReactElement> {
  const t = await getTranslations('quest')
  // 퀘스트 제목·설명 키는 `quest.tutorial.1.title` 형태의 전역 경로다.
  const tRoot = await getTranslations()

  return (
    <article className="border-hairline space-y-3 rounded border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-ink text-base">{tRoot(quest.titleKey)}</h3>
            {quest.chain && (
              <Badge variant="secondary">
                {t('tutorialChain', { order: quest.chain.order, total: quest.chain.total })}
              </Badge>
            )}
          </div>
          <p className="text-ash text-sm">{tRoot(quest.descriptionKey)}</p>
        </div>

        {quest.claimable && <Badge className="shrink-0">{t('statusCompleted')}</Badge>}
      </header>

      <div className="space-y-1">
        <div className="text-ash flex items-center justify-between text-xs tabular-nums">
          <span>{t('progressLabel')}</span>
          <span>
            {formatInt(quest.progress)} / {formatInt(quest.target)}
          </span>
        </div>
        <Progress value={quest.percent} aria-label={t('progressLabel')} />
      </div>

      <div className="space-y-2">
        <p className="text-ash text-xs">{t('rewardLabel')}</p>
        <RewardLines rewards={quest.rewards} />
      </div>

      <QuestClaimButton questId={quest.questId} claimable={quest.claimable} />
    </article>
  )
}
