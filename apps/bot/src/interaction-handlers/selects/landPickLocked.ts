/**
 * 컨트롤 Row `[확장]` 에서 잠긴 슬롯을 선택한 뒤, `LandService.expandSlot` 을 호출하는 핸들러.
 *
 * customId 포맷: `land:pick-locked:<ownerId>:<landIndex>`.
 * 선택 value 는 `"x,y"`.
 *
 * 성공 시 갱신된 그리드로 update + 성공 요약 followUp (공개).
 * 실패 시 에러 문구로 교체 (액션 메뉴 back 버튼은 그리드로 복귀).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import {
  LAND_PICK_LOCKED_SELECT_PREFIX,
  buildLandViewPayload,
  parseXYValue
} from '../../commands/game/land'
import { LandService } from '../../services/land'
import { ServiceError } from '../../services/base'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandPickLockedSelectHandler extends InteractionHandler {
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
      LAND_PICK_LOCKED_SELECT_PREFIX
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

    try {
      const result = await LandService.expandSlot(db, {
        userId: interaction.user.id,
        landIndex: data.landIndex,
        x: data.x,
        y: data.y
      })
      const viewPayload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: data.landIndex,
        t
      })
      await interaction.editReply(
        viewPayload as Parameters<typeof interaction.editReply>[0]
      )
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.expand.success', {
              index: result.landIndex,
              x: result.x,
              y: result.y,
              order: result.order,
              cost: formatBigInt(result.cost),
              remaining: formatBigInt(result.remainingMoney)
            })
          )
        ],
        flags: v2Flags(false)
      })
    } catch (err) {
      await interaction.editReply({
        components: [
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            resolveExpandErrorBody(err, t, this.container.logger)
          )
        ]
      })
    }
  }
}

function resolveExpandErrorBody(
  err: unknown,
  t: TFunction,
  logger: { error: (e: unknown) => void }
): string {
  if (!(err instanceof ServiceError)) {
    logger.error(err)
    return t('game:common.error.unknown')
  }
  switch (err.code) {
    case 'LAND_NOT_FOUND':
      return t('game:factory.build.error.landNotFound')
    case 'OUT_OF_BOUNDS':
      return t('game:factory.build.error.outOfBounds')
    case 'SLOT_ALREADY_UNLOCKED':
      return t('game:land.expand.error.alreadyUnlocked')
    case 'LEVEL_LOCKED': {
      const d = (err.details ?? {}) as { level?: number }
      return t('game:land.expand.error.levelLocked', { level: d.level ?? '?' })
    }
    case 'INSUFFICIENT_MONEY': {
      const d = (err.details ?? {}) as { required?: string }
      return t('game:land.expand.error.insufficientMoney', {
        required: d.required ?? '-'
      })
    }
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    default:
      logger.error(err)
      return t('game:common.error.unknown')
  }
}
