/**
 * 공장 철거 확인 버튼 핸들러 (Phase 2 step 4d).
 *
 * customId 포맷: `factory:destroy:<factoryId>:<yes|cancel>`
 *
 * - `yes`: `FactoryService.destroy` 호출 → 환불 요약 followUp + 갱신된 그리드로 update
 * - `cancel`: 액션 메뉴로 돌아가는 대신 바로 그리드로 복귀 (간단함 우선)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { FACTORY_CATALOG } from '@idle/game-core'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import type { ButtonInteraction, InteractionUpdateOptions } from 'discord.js'
import { formatBigInt } from '@structures/renderers'
import {
  FACTORY_DESTROY_BUTTON_PREFIX,
  buildLandViewPayload
} from '../../commands/game/land'
import { FactoryService } from '../../services/factory'
import { ServiceError } from '../../services/base'

type Decision = 'yes' | 'cancel'

export class FactoryDestroyButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(FACTORY_DESTROY_BUTTON_PREFIX)) {
      return this.none()
    }
    const rest = interaction.customId.slice(
      FACTORY_DESTROY_BUTTON_PREFIX.length
    )
    const lastColon = rest.lastIndexOf(':')
    if (lastColon <= 0) return this.none()
    const factoryId = rest.slice(0, lastColon)
    const decision = rest.slice(lastColon + 1)
    if (decision !== 'yes' && decision !== 'cancel') return this.none()
    return this.some({ factoryId, decision: decision as Decision })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { factoryId: string; decision: Decision }
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    if (data.decision === 'cancel') {
      const landIndex = await this.getLandIndex(data.factoryId)
      const payload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: landIndex,
        t
      })
      await interaction.update(payload as InteractionUpdateOptions)
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.info,
            undefined,
            t('game:factory.destroy.cancelled')
          )
        ],
        flags: v2Flags(true)
      })
      return
    }

    try {
      const result = await FactoryService.destroy(db, {
        userId: interaction.user.id,
        factoryId: data.factoryId
      })
      const payload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: result.landIndex,
        t
      })
      await interaction.update(payload as InteractionUpdateOptions)
      const entry = FACTORY_CATALOG[result.type]
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:factory.destroy.success', {
              emoji: entry.emoji,
              type: result.type,
              refund: formatBigInt(result.refund),
              remaining: formatBigInt(result.remainingMoney)
            })
          )
        ],
        flags: v2Flags(true)
      })
    } catch (err) {
      await this.replyWarn(
        interaction,
        resolveDestroyErrorBody(err, t, this.container.logger)
      )
    }
  }

  private async getLandIndex(factoryId: string): Promise<number> {
    const row = await this.container.db.factory.findUnique({
      where: { id: factoryId },
      select: { land: { select: { index: true } } }
    })
    return row?.land?.index ?? 1
  }

  private async replyWarn(
    interaction: ButtonInteraction,
    body: string
  ): Promise<void> {
    const payload = {
      components: [simpleContainer(V2_ACCENT.warn, undefined, body)],
      flags: v2Flags(true)
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload)
    } else {
      await interaction.reply(payload)
    }
  }
}

function resolveDestroyErrorBody(
  err: unknown,
  t: TFunction,
  logger: { error: (e: unknown) => void }
): string {
  if (!(err instanceof ServiceError)) {
    logger.error(err)
    return t('game:common.error.unknown')
  }
  switch (err.code) {
    case 'FACTORY_NOT_FOUND':
      return t('game:common.error.factoryNotFound')
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    default:
      logger.error(err)
      return t('game:common.error.unknown')
  }
}
