/**
 * `/land view` 4×4 셀 그리드 버튼 핸들러 (Phase 2 step 3 플레이스홀더).
 *
 * customId 포맷: `land:cell:<landIndex>:<x>:<y>`.
 *
 * 현재는 "곧 지원" ephemeral 응답만 반환한다. Phase 2 step 4에서
 * 빈 셀 → build modal, 공장 셀 → harvest/upgrade/destroy 라우팅으로 확장한다.
 *
 * 참조: `docs/design/11-land.md`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import type { ButtonInteraction } from 'discord.js'
import { LAND_CELL_BUTTON_PREFIX } from '../../commands/game/land'

export class LandCellButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(LAND_CELL_BUTTON_PREFIX)) {
      return this.none()
    }
    const rest = interaction.customId.slice(LAND_CELL_BUTTON_PREFIX.length)
    const [landRaw, xRaw, yRaw] = rest.split(':')
    const landIndex = Number.parseInt(landRaw ?? '', 10)
    const x = Number.parseInt(xRaw ?? '', 10)
    const y = Number.parseInt(yRaw ?? '', 10)
    if (
      !Number.isInteger(landIndex) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      return this.none()
    }
    return this.some({ landIndex, x, y })
  }

  public async run(interaction: ButtonInteraction): Promise<void> {
    const t = await fetchT(interaction)
    await interaction.reply({
      components: [
        simpleContainer(
          V2_ACCENT.info,
          undefined,
          t('game:land.view.cellComingSoon')
        )
      ],
      flags: v2Flags(true)
    })
  }
}
