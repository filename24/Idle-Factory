/**
 * 컨트롤 Row `[철거]` 에서 공장 1개를 선택한 뒤, 기존 destroy-confirm UX 로 전환하는 핸들러.
 *
 * customId 포맷: `land:pick-factory:<ownerId>:<landIndex>`.
 * 선택 value 는 factoryId.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import { buildCost } from '@idle/game-core'
import {
  LAND_PICK_FACTORY_SELECT_PREFIX,
  buildDestroyConfirmPayload
} from '../../commands/game/land'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandPickFactorySelectHandler extends InteractionHandler {
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
      LAND_PICK_FACTORY_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const landIndex = Number.parseInt(parsed.rest, 10)
    const factoryId = interaction.values[0]
    if (!Number.isInteger(landIndex) || landIndex < 1 || !factoryId) {
      return this.none()
    }
    return this.some({ ownerId: parsed.ownerId, landIndex, factoryId })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; landIndex: number; factoryId: string }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    const factory = await db.factory.findUnique({
      where: { id: data.factoryId },
      select: { userId: true, type: true }
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

    const payload = buildDestroyConfirmPayload({
      ownerId: interaction.user.id,
      factoryId: data.factoryId,
      factoryType: factory.type,
      refund: buildCost(factory.type) / 2n,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
