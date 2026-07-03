/**
 * 이동 목적지 선택 핸들러 → 비용 확인 단계로 전환.
 *
 * customId 포맷: `land:mv-dest:<ownerId>:<landIndex>:<factoryId>`. 선택 value 는 `"x,y"`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import { parseXYValue } from '../../commands/game/land'
import {
  LAND_MOVE_DEST_SELECT_PREFIX,
  buildMoveConfirmPayload
} from '../../commands/game/landMove'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandPickMoveDestSelectHandler extends InteractionHandler {
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
      LAND_MOVE_DEST_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    // rest = `<landIndex>:<factoryId>` — factoryId(cuid)에는 ':'가 없다.
    const colon = parsed.rest.indexOf(':')
    if (colon <= 0) return this.none()
    const landIndex = Number.parseInt(parsed.rest.slice(0, colon), 10)
    const factoryId = parsed.rest.slice(colon + 1)
    const value = interaction.values[0]
    if (!Number.isInteger(landIndex) || landIndex < 1 || !factoryId || !value) {
      return this.none()
    }
    const xy = parseXYValue(value)
    if (!xy) return this.none()
    return this.some({
      ownerId: parsed.ownerId,
      landIndex,
      factoryId,
      toX: xy.x,
      toY: xy.y
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: {
      ownerId: string
      landIndex: number
      factoryId: string
      toX: number
      toY: number
    }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    const factory = await db.factory.findUnique({
      where: { id: data.factoryId },
      select: { userId: true, type: true, anchorX: true, anchorY: true }
    })
    if (!factory || factory.userId !== interaction.user.id) {
      await interaction.editReply({
        components: [
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:common.error.factoryNotFound')
          )
        ]
      })
      return
    }

    const payload = buildMoveConfirmPayload({
      ownerId: interaction.user.id,
      landIndex: data.landIndex,
      factoryId: data.factoryId,
      factoryType: factory.type,
      fromX: factory.anchorX,
      fromY: factory.anchorY,
      toX: data.toX,
      toY: data.toY,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
