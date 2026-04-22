/**
 * `/land view` 4×4 셀 그리드 버튼 핸들러.
 *
 * customId 포맷: `land:cell:<landIndex>:<x>:<y>`.
 *
 * 동작:
 * - 빈 셀(`empty`/`special`) → 건설할 공장 타입 StringSelect 로 같은 메시지 update (4b)
 * - 공장 앵커(`factory-anchor`) → info/harvest/upgrade/destroy 액션 메뉴 (4c)
 * - 공장 비앵커(`factory-body`) → 정상 경로로는 도달 불가 (버튼 disabled). 방어적으로 정보 응답
 *
 * 참조: `docs/design/11-land.md`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import type { ButtonInteraction, InteractionUpdateOptions } from 'discord.js'
import {
  LAND_CELL_BUTTON_PREFIX,
  buildBuildTypeSelectPayload,
  resolveLandCell
} from '../../commands/game/land'

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

  public async run(
    interaction: ButtonInteraction,
    data: { landIndex: number; x: number; y: number }
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    const resolved = await resolveLandCell(
      db,
      interaction.user.id,
      data.landIndex,
      data.x,
      data.y
    )
    if (!resolved) {
      await interaction.reply({
        components: [
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:land.view.error.cellNotFound')
          )
        ],
        flags: v2Flags(true)
      })
      return
    }

    const { cell } = resolved

    if (cell.kind === 'empty' || cell.kind === 'special') {
      const user = await db.user.findUnique({
        where: { id: interaction.user.id },
        select: { level: true }
      })
      const payload = buildBuildTypeSelectPayload({
        userLevel: user?.level ?? 1,
        landIndex: data.landIndex,
        x: data.x,
        y: data.y,
        t
      })
      await interaction.update(payload as InteractionUpdateOptions)
      return
    }

    // factory-anchor / factory-body — step 4c에서 확장. 현재는 플레이스홀더.
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
