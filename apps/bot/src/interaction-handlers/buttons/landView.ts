/**
 * `/land view` Prev/Next 버튼 핸들러.
 *
 * customId 포맷: `land:view:<ownerId>:<index>` — `<index>`는 이동할 대상 토지 번호(1~5)
 * 또는 비활성(disabled) 상태를 표시하기 위한 센티넬 문자열.
 *
 * 동작:
 * 1. parse에서 prefix 매칭 + ownerId/index 파싱
 * 2. run 진입 시 interaction.user.id === ownerId 확인. 다른 유저면 ephemeral 경고 후 종료.
 * 3. `buildLandViewPayload` 호출 → `interaction.update()`로 같은 메시지 교체
 *    (Components v2 정책상 새 메시지 생성 금지)
 *
 * 참조: `docs/design/11-land.md`, `.claude/skills/componentsv2-builder/SKILL.md`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import {
  buildLandViewPayload,
  LAND_VIEW_BUTTON_PREFIX
} from '../../commands/game/land'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandViewButtonHandler extends InteractionHandler {
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
    const parsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      LAND_VIEW_BUTTON_PREFIX
    )
    if (!parsed) return this.none()
    const index = Number.parseInt(parsed.rest, 10)
    if (!Number.isInteger(index) || index < 1) return this.none()
    return this.some({ ownerId: parsed.ownerId, index })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { ownerId: string; index: number }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    const payload = await buildLandViewPayload(db, {
      userId: interaction.user.id,
      targetIndex: data.index,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
