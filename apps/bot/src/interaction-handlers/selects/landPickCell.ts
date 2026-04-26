/**
 * 컨트롤 Row `[건설]` 에서 빈 셀을 선택한 뒤, 기존 건설 타입 select 로 전환하는 핸들러.
 *
 * customId 포맷: `land:pick-cell:<ownerId>:<landIndex>`.
 * 선택 value 는 `"x,y"`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import {
  LAND_PICK_CELL_SELECT_PREFIX,
  buildBuildTypeSelectPayload,
  parseXYValue
} from '../../commands/game/land'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandPickCellSelectHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.SelectMenu
    })
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    const parsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      LAND_PICK_CELL_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const landIndex = Number.parseInt(parsed.rest, 10)
    const value = interaction.values[0]
    if (!Number.isInteger(landIndex) || landIndex < 1 || !value) {
      return this.none()
    }
    const xy = parseXYValue(value)
    if (!xy) return this.none()
    return this.some({ ownerId: parsed.ownerId, landIndex, x: xy.x, y: xy.y })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; landIndex: number; x: number; y: number }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    const user = await db.user.findUnique({
      where: { id: interaction.user.id },
      select: { level: true }
    })
    const payload = buildBuildTypeSelectPayload({
      ownerId: interaction.user.id,
      userLevel: user?.level ?? 1,
      landIndex: data.landIndex,
      x: data.x,
      y: data.y,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
