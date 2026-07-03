/**
 * 컨트롤 Row `[이동]` → "이동할 공장" 선택 핸들러.
 *
 * customId 포맷: `land:mv-pick:<ownerId>:<landIndex>`. 선택 value 는 factoryId.
 * 공장을 고르면 배치 가능한 목적지 앵커를 계산해 "목적지 선택" 단계로 전환한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import {
  LAND_MOVE_PICK_SELECT_PREFIX,
  buildMoveDestPickSelectPayload,
  listMoveAnchors
} from '../../commands/game/landMove'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandPickMoveFactorySelectHandler extends InteractionHandler {
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
      LAND_MOVE_PICK_SELECT_PREFIX
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

    const land = await db.land.findUnique({
      where: {
        userId_index: { userId: interaction.user.id, index: data.landIndex }
      },
      include: { slots: true }
    })
    const factory = await db.factory.findUnique({
      where: { id: data.factoryId },
      select: {
        id: true,
        userId: true,
        landId: true,
        type: true,
        anchorX: true,
        anchorY: true
      }
    })

    // 남의 공장·타 구역 공장·존재하지 않는 공장은 이동 불가.
    if (
      !land ||
      !factory ||
      factory.userId !== interaction.user.id ||
      factory.landId !== land.id
    ) {
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

    const anchors = listMoveAnchors({
      landWidth: land.width,
      landHeight: land.height,
      slots: land.slots,
      factory: {
        id: factory.id,
        type: factory.type,
        anchorX: factory.anchorX,
        anchorY: factory.anchorY
      }
    })

    const payload = buildMoveDestPickSelectPayload({
      ownerId: interaction.user.id,
      landIndex: data.landIndex,
      factoryId: factory.id,
      factoryType: factory.type,
      anchors,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
