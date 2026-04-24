/**
 * `/land view` Prev/Next 버튼 핸들러.
 *
 * customId 포맷: `land:view:<index>` — `<index>`는 이동할 대상 토지 번호(1~5).
 *
 * 동작:
 * 1. parse에서 prefix 매칭 + index 파싱
 * 2. run에서 `buildLandViewPayload` 호출 → `interaction.update()`로 같은 메시지 교체
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
    if (!interaction.customId.startsWith(LAND_VIEW_BUTTON_PREFIX)) {
      return this.none()
    }
    const raw = interaction.customId.slice(LAND_VIEW_BUTTON_PREFIX.length)
    const index = Number.parseInt(raw, 10)
    if (!Number.isInteger(index) || index < 1) return this.none()
    return this.some({ index })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { index: number }
  ): Promise<void> {
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
