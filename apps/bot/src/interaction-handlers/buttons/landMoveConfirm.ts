/**
 * 공장 이동 확인 버튼 핸들러.
 *
 * customId 포맷: `land:mv-go:<ownerId>:<landIndex>:<factoryId>:<x>:<y>:<decision>`
 *
 * - `yes`: `LandService.moveFactory` 호출 → 갱신된 그리드로 update + 이동 요약 followUp
 * - `cancel`: 즉시 그리드로 복귀 + 취소 안내 followUp
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { FACTORY_CATALOG } from '@idle/game-core'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import type { ButtonInteraction } from 'discord.js'
import { formatBigInt } from '@structures/renderers'
import { buildLandViewPayload } from '../../commands/game/land'
import {
  LAND_MOVE_CONFIRM_BUTTON_PREFIX,
  resolveMoveErrorBody
} from '../../commands/game/landMove'
import { LandService } from '../../services/land'
import { ServiceError } from '../../services/base'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { localizeFactoryType } from '../../utils/enumLocale'

type Decision = 'yes' | 'cancel'

interface MoveConfirmData {
  ownerId: string
  landIndex: number
  factoryId: string
  toX: number
  toY: number
  decision: Decision
}

export class LandMoveConfirmButtonHandler extends InteractionHandler {
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
      LAND_MOVE_CONFIRM_BUTTON_PREFIX
    )
    if (!parsed) return this.none()
    // rest = `<landIndex>:<factoryId>:<x>:<y>:<decision>` — factoryId(cuid)에는 ':'가 없어 5분할.
    const parts = parsed.rest.split(':')
    if (parts.length !== 5) return this.none()
    const [landRaw, factoryId, xRaw, yRaw, decision] = parts
    const landIndex = Number.parseInt(landRaw ?? '', 10)
    const toX = Number.parseInt(xRaw ?? '', 10)
    const toY = Number.parseInt(yRaw ?? '', 10)
    if (
      !Number.isInteger(landIndex) ||
      landIndex < 1 ||
      !factoryId ||
      !Number.isInteger(toX) ||
      !Number.isInteger(toY) ||
      (decision !== 'yes' && decision !== 'cancel')
    ) {
      return this.none()
    }
    return this.some({
      ownerId: parsed.ownerId,
      landIndex,
      factoryId,
      toX,
      toY,
      decision: decision as Decision
    })
  }

  public async run(
    interaction: ButtonInteraction,
    data: MoveConfirmData
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return
    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    if (data.decision === 'cancel') {
      await this.rerenderView(interaction, data.landIndex, t)
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.info,
            undefined,
            t('game:land.move.cancelled')
          )
        ],
        flags: v2Flags(false)
      })
      return
    }

    try {
      const result = await LandService.moveFactory(db, {
        userId: interaction.user.id,
        landIndex: data.landIndex,
        factoryId: data.factoryId,
        toX: data.toX,
        toY: data.toY
      })
      await this.rerenderView(interaction, result.landIndex, t)
      const entry = FACTORY_CATALOG[result.type]
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.move.success', {
              emoji: entry.emoji,
              type: localizeFactoryType(t, result.type),
              fromX: result.fromX,
              fromY: result.fromY,
              toX: result.toX,
              toY: result.toY,
              cost: formatBigInt(result.cost),
              remaining: formatBigInt(result.remainingMoney)
            })
          )
        ],
        flags: v2Flags(false)
      })
    } catch (err) {
      const body =
        err instanceof ServiceError
          ? resolveMoveErrorBody(err.code, t, err.details)
          : t('game:common.error.unknown')
      if (!(err instanceof ServiceError)) this.container.logger.error(err)
      await interaction.editReply({
        components: [simpleContainer(V2_ACCENT.warn, undefined, body)]
      })
    }
  }

  private async rerenderView(
    interaction: ButtonInteraction,
    landIndex: number,
    t: Awaited<ReturnType<typeof fetchT>>
  ): Promise<void> {
    const payload = await buildLandViewPayload(this.container.db, {
      userId: interaction.user.id,
      targetIndex: landIndex,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
