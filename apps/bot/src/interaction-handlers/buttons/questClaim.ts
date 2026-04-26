/**
 * `/quest` 의 [보상 받기] / [새로고침] 버튼 핸들러.
 *
 * customId 포맷:
 *   `quest:claim:<ownerId>:<questId>`
 *   `quest:refresh:<ownerId>`
 *
 * 클레임:
 *  1. owner 검증.
 *  2. `runInTx(db, tx => QuestService.claim(tx, ownerId, questId))`.
 *  3. 응답 페이로드: 클레임 결과 컨테이너 + (있으면) 다음 퀘스트 시작 알림 + 다음 카드.
 *
 * 새로고침:
 *  - 현재 활성 퀘스트 카드를 재렌더해 update.
 *
 * 본 핸들러는 ServiceError 를 그대로 throw — `chatInputCommandError` 리스너가 잡아 사용자에게 알린다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import { getQuestDef } from '@idle/game-core'
import {
  buildClaimedContainer,
  buildEmptyQuestContainer,
  buildQuestCardContainer,
  buildUnlockedContainer
} from '@structures/renderers'
import { v2PayloadFromContainers } from '@utils/ComponentsV2'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '@utils/interactionOwner'
import { runInTx } from '../../services/base'
import { QuestService } from '../../services/quest'

const CLAIM_PREFIX = 'quest:claim:'
const REFRESH_PREFIX = 'quest:refresh:'

interface Parsed {
  readonly action: 'claim' | 'refresh'
  readonly ownerId: string
  readonly questId?: string
}

function parse(customId: string): Parsed | null {
  const claim = parseOwnerPrefixedCustomId(customId, CLAIM_PREFIX)
  if (claim) {
    return { action: 'claim', ownerId: claim.ownerId, questId: claim.rest }
  }
  const refresh = parseOwnerPrefixedCustomId(customId, REFRESH_PREFIX)
  if (refresh) {
    // refresh 의 customId 는 `quest:refresh:<ownerId>:` 형식 — rest 가 빈 문자열일 수 있다.
    // parseOwnerPrefixedCustomId 는 ownerId 뒤에 ':' 가 있어야 통과하므로 호환을 위해
    // refresh customId 는 항상 `quest:refresh:<ownerId>:_` 형태로 발급 (`_` placeholder).
    return { action: 'refresh', ownerId: refresh.ownerId }
  }
  // 폴백: refresh 가 placeholder 없이 들어온 경우 직접 파싱.
  if (customId.startsWith(REFRESH_PREFIX)) {
    const ownerId = customId.slice(REFRESH_PREFIX.length)
    if (/^\d{5,25}$/.test(ownerId)) {
      return { action: 'refresh', ownerId }
    }
  }
  return null
}

export class QuestButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button
    })
  }

  public override parse(interaction: ButtonInteraction) {
    const data = parse(interaction.customId)
    if (!data) return this.none()
    return this.some(data)
  }

  public async run(
    interaction: ButtonInteraction,
    data: Parsed
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const { db } = this.container
    const t = await fetchT(interaction)

    if (data.action === 'refresh') {
      const visible = await QuestService.listVisible(db, data.ownerId)
      if (visible.length === 0) {
        await interaction.update({
          components: [buildEmptyQuestContainer(t)]
        } as Parameters<typeof interaction.update>[0])
        return
      }
      await interaction.update({
        components: [buildQuestCardContainer(visible[0]!, data.ownerId, t)]
      } as Parameters<typeof interaction.update>[0])
      return
    }

    // claim
    if (!data.questId) return
    await interaction.deferUpdate()

    const result = await runInTx(db, (tx) =>
      QuestService.claim(tx, data.ownerId, data.questId!)
    )

    const claimedDef = getQuestDef(result.claimed.questId)
    const claimedTitle = claimedDef
      ? t(claimedDef.title)
      : result.claimed.questId

    const containers = [buildClaimedContainer(claimedTitle, result.grants, t)]
    if (result.unlocked) {
      containers.push(buildUnlockedContainer(result.unlocked, t))
      containers.push(buildQuestCardContainer(result.unlocked, data.ownerId, t))
    } else {
      containers.push(buildEmptyQuestContainer(t))
    }

    await interaction.editReply(
      v2PayloadFromContainers(containers) as Parameters<
        typeof interaction.editReply
      >[0]
    )
  }
}

/** 외부에서 prefix 를 재사용할 때 export. */
export {
  CLAIM_PREFIX as QUEST_CLAIM_BUTTON_PREFIX,
  REFRESH_PREFIX as QUEST_REFRESH_BUTTON_PREFIX
}
