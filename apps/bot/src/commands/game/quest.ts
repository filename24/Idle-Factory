/**
 * `/quest` 커맨드.
 *
 * 활성 퀘스트(`status != CLAIMED`) 를 카드로 보여준다.
 * 단일 응답 — 서브커맨드 없음. TUTORIAL 진행 중인 1개 노드만 표시.
 *
 * 수동 클레임 정책: COMPLETED 행에는 [보상 받기] 버튼이 enabled, 그 외에는 disabled.
 *
 * 참조: docs/design/00-onboarding.md §튜토리얼 퀘스트 체인
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { v2Flags } from '@utils/ComponentsV2'
import {
  buildEmptyQuestContainer,
  buildQuestCardContainer
} from '@structures/renderers'
import { QuestService } from '../../services/quest'

export class QuestCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const visible = await QuestService.listVisible(db, interaction.user.id)

    if (visible.length === 0) {
      return interaction.reply({
        components: [buildEmptyQuestContainer(t)],
        flags: v2Flags(false)
      })
    }

    // TUTORIAL 진행 중이면 그 카드만 1개 노출 (chain 의 현재 노드).
    // 미래 DAILY/ACHIEVEMENT 도입 시엔 type 별로 분리해 다중 카드 노출하도록 확장.
    const head = visible[0]!
    return interaction.reply({
      components: [buildQuestCardContainer(head, interaction.user.id, t)],
      flags: v2Flags(false)
    })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('quest')
        .setDescription('Show your active quest.')
        .setNameLocalization('ko', '퀘스트')
        .setDescriptionLocalization('ko', '진행 중인 퀘스트를 확인합니다.')
    )
  }
}
