/**
 * 퀘스트 UI 렌더러.
 *
 * `/quest` 명령과 클레임 버튼 핸들러, `questNotifier.appendQuestCompletions` 가 공통으로 사용한다.
 * Components v2 + i18n 기반. 모든 텍스트는 게임 namespace 아래 `quest.*` 키로 통일.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import type { TFunction } from '@sapphire/plugin-i18next'
import { getQuestDef, type Reward } from '@idle/game-core'
import type { UserQuest } from '@idle/database'
import type { GrantedReward } from '../../services/reward'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import { formatBigInt } from './FactoryRenderer'

const PROGRESS_BAR_FILLED = '▰'
const PROGRESS_BAR_EMPTY = '▱'
const PROGRESS_BAR_WIDTH = 5

const TUTORIAL_TOTAL = 5

/**
 * 진행 바 텍스트를 만든다.
 *
 * 예: `progress=2, target=5` → `"▰▰▱▱▱"`.
 */
export function formatProgressBar(
  progress: bigint,
  target: bigint,
  width = PROGRESS_BAR_WIDTH
): string {
  if (target <= 0n) return PROGRESS_BAR_EMPTY.repeat(width)
  const ratio = Number(progress > target ? target : progress) / Number(target)
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)))
  return (
    PROGRESS_BAR_FILLED.repeat(filled) +
    PROGRESS_BAR_EMPTY.repeat(width - filled)
  )
}

/**
 * 보상 한 줄을 i18n 으로 변환.
 *
 * MONEY/XP/MATERIAL 별 `quest.reward.<kind>` 키를 사용.
 */
export function formatReward(
  reward: Reward | GrantedReward,
  t: TFunction
): string {
  if (reward.kind === 'MONEY') {
    return t('game:quest.reward.money', { amount: formatBigInt(reward.amount) })
  }
  if (reward.kind === 'XP') {
    return t('game:quest.reward.xp', { amount: formatBigInt(reward.amount) })
  }
  // MATERIAL
  return t('game:quest.reward.material', {
    amount: formatBigInt(reward.amount),
    material: 'material' in reward ? (reward.material ?? '') : ''
  })
}

/**
 * 보상 배열을 한 줄짜리 라인으로 합친다. 빈 배열이면 빈 문자열.
 */
export function formatRewards(
  rewards: readonly (Reward | GrantedReward)[],
  t: TFunction
): string {
  if (rewards.length === 0) return ''
  return rewards.map((r) => formatReward(r, t)).join(' · ')
}

/**
 * UserQuest.rewardSnapshot (JSON) 을 Reward[] 로 복원한다.
 * 직렬화 시 amount 가 string 으로 저장되므로 BigInt 로 환원.
 */
export function deserializeSnapshotRewards(snapshot: unknown): Reward[] {
  if (!Array.isArray(snapshot)) return []
  return snapshot.map((raw) => {
    const r = raw as { kind: string; amount: string; material?: string }
    if (r.kind === 'MATERIAL') {
      return {
        kind: 'MATERIAL',
        amount: BigInt(r.amount),
        material: r.material as Reward extends { material: infer M } ? M : never
      } as Reward
    }
    if (r.kind === 'XP') return { kind: 'XP', amount: BigInt(r.amount) }
    return { kind: 'MONEY', amount: BigInt(r.amount) }
  })
}

/**
 * 한 UserQuest 를 카드 형태의 Container 로 렌더한다.
 *
 * - 본문: 카탈로그의 title/description (i18n) + 진행 바 + 보상 라인.
 * - 하단: [보상 받기] 버튼 (status === COMPLETED 일 때만 enabled) + [새로고침].
 *
 * customId:
 *  - 클레임: `quest:claim:<ownerId>:<questId>`
 *  - 새로고침: `quest:refresh:<ownerId>`
 */
export function buildQuestCardContainer(
  row: UserQuest,
  ownerId: string,
  t: TFunction
): ContainerBuilder {
  const def = getQuestDef(row.questId)
  const title = def ? t(def.title) : row.questId
  const description = def ? t(def.description) : ''
  const isCompleted = row.status === 'COMPLETED'
  const accent = isCompleted ? V2_ACCENT.success : V2_ACCENT.info

  const headerLines: string[] = [`# **${t('game:quest.title')}**`]
  if (def?.chain?.name === 'tutorial') {
    headerLines.push(
      `-# ${t('game:quest.tutorialChain', {
        order: def.chain.order,
        total: TUTORIAL_TOTAL
      })}`
    )
  }

  const container = new ContainerBuilder().setAccentColor(accent)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerLines.join('\n'))
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${title}`)
  )
  if (description) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(description)
    )
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:quest.progressLabel', {
        bar: formatProgressBar(row.progress, row.target),
        progress: formatBigInt(row.progress),
        target: formatBigInt(row.target)
      })
    )
  )
  const rewards = deserializeSnapshotRewards(row.rewardSnapshot)
  if (rewards.length > 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:quest.rewardLabel', { rewards: formatRewards(rewards, t) })
      )
    )
  }

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const claimBtn = new ButtonBuilder()
    .setCustomId(`quest:claim:${ownerId}:${row.questId}`)
    .setStyle(ButtonStyle.Success)
    .setLabel(t('game:quest.claimButton'))
    .setDisabled(!isCompleted)
  const refreshBtn = new ButtonBuilder()
    // placeholder ':_' 로 끝나야 parseOwnerPrefixedCustomId 통과 (ownerId 뒤 콜론 필요).
    .setCustomId(`quest:refresh:${ownerId}:_`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:quest.refreshButton'))

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(claimBtn, refreshBtn)
  )

  return container
}

/**
 * 빈 상태(모든 퀘스트 클레임 완료) 컨테이너.
 */
export function buildEmptyQuestContainer(t: TFunction): ContainerBuilder {
  return simpleContainer(
    V2_ACCENT.info,
    t('game:quest.title'),
    t('game:quest.empty.tutorialDone')
  )
}

/**
 * 클레임 직후 노출하는 "✅ 보상 수령 완료" 컨테이너.
 */
export function buildClaimedContainer(
  questTitle: string,
  grants: readonly GrantedReward[],
  t: TFunction
): ContainerBuilder {
  return simpleContainer(
    V2_ACCENT.success,
    t('game:quest.claimed.title'),
    t('game:quest.claimed.body', {
      title: questTitle,
      rewards: formatRewards(grants, t) || '—'
    })
  )
}

/**
 * 체인 다음 노드가 새로 시드됐을 때 노출하는 "🆕 새 퀘스트" 컨테이너.
 */
export function buildUnlockedContainer(
  next: UserQuest,
  t: TFunction
): ContainerBuilder {
  const def = getQuestDef(next.questId)
  const title = def ? t(def.title) : next.questId
  const description = def ? t(def.description) : ''
  return simpleContainer(
    V2_ACCENT.rare,
    t('game:quest.unlocked.title'),
    t('game:quest.unlocked.body', { title, description })
  )
}

/**
 * 게임 명령 응답에 덧붙일 "🎉 퀘스트 완료" 컨테이너.
 *
 * 클레임은 수동이므로 사용자에게 `/quest` 로 가서 [보상 받기] 누르라고 안내한다.
 */
export function buildCompletionContainer(
  row: UserQuest,
  t: TFunction
): ContainerBuilder {
  const def = getQuestDef(row.questId)
  const title = def ? t(def.title) : row.questId
  const rewards = deserializeSnapshotRewards(row.rewardSnapshot)

  const lines = [
    `**${title}**`,
    rewards.length > 0
      ? t('game:quest.rewardLabel', { rewards: formatRewards(rewards, t) })
      : '',
    t('game:quest.completed.claimHint')
  ].filter(Boolean)

  return simpleContainer(
    V2_ACCENT.success,
    t('game:quest.completed.title'),
    lines.join('\n')
  )
}
