/**
 * `/land view` 건설 타입 StringSelect 핸들러 (Phase 2 step 4b).
 *
 * customId 포맷: `land:build:<landIndex>:<x>:<y>`.
 * 선택 값: `FactoryType` enum 값 또는 취소 sentinel (`LAND_BUILD_CANCEL_VALUE`).
 *
 * 동작:
 * 1. parse에서 prefix + 정수 파싱
 * 2. 취소면 land view 로 `interaction.update`
 * 3. 공장 타입이면 `FactoryService.build` 호출 → 성공 시 갱신된 그리드로 update,
 *    실패 시 `ServiceError.code`를 i18n 키로 매핑해 ephemeral followUp (원본 메시지는
 *    그대로 select 상태로 남겨두지 않고 그리드로 복귀)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import type {
  InteractionUpdateOptions,
  StringSelectMenuInteraction
} from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import {
  LAND_BUILD_CANCEL_VALUE,
  LAND_BUILD_SELECT_PREFIX,
  buildLandViewPayload
} from '../../commands/game/land'
import { FactoryService } from '../../services/factory'
import { ServiceError } from '../../services/base'

export class LandBuildTypeSelectHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(LAND_BUILD_SELECT_PREFIX)) {
      return this.none()
    }
    const rest = interaction.customId.slice(LAND_BUILD_SELECT_PREFIX.length)
    const [landRaw, xRaw, yRaw] = rest.split(':')
    const landIndex = Number.parseInt(landRaw ?? '', 10)
    const x = Number.parseInt(xRaw ?? '', 10)
    const y = Number.parseInt(yRaw ?? '', 10)
    const value = interaction.values[0]
    if (
      !Number.isInteger(landIndex) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !value
    ) {
      return this.none()
    }
    return this.some({ landIndex, x, y, value })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { landIndex: number; x: number; y: number; value: string }
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    if (data.value === LAND_BUILD_CANCEL_VALUE) {
      await this.refreshGrid(interaction, data.landIndex, t)
      return
    }

    try {
      await FactoryService.build(db, {
        userId: interaction.user.id,
        landIndex: data.landIndex,
        type: data.value as FactoryType,
        anchorX: data.x,
        anchorY: data.y
      })
      await this.refreshGrid(interaction, data.landIndex, t)
    } catch (err) {
      await this.refreshGrid(interaction, data.landIndex, t)
      const body = resolveBuildErrorBody(err, t, this.container.logger)
      await interaction.followUp({
        components: [simpleContainer(V2_ACCENT.warn, undefined, body)],
        flags: v2Flags(true)
      })
    }
  }

  private async refreshGrid(
    interaction: StringSelectMenuInteraction,
    landIndex: number,
    t: TFunction
  ): Promise<void> {
    const { db } = this.container
    const payload = await buildLandViewPayload(db, {
      userId: interaction.user.id,
      targetIndex: landIndex,
      t
    })
    await interaction.update(payload as InteractionUpdateOptions)
  }
}

/** `FactoryService.build`에서 던진 `ServiceError`를 i18n 문구로 매핑한다. */
function resolveBuildErrorBody(
  err: unknown,
  t: TFunction,
  logger: { error: (e: unknown) => void }
): string {
  if (!(err instanceof ServiceError)) {
    logger.error(err)
    return t('game:common.error.unknown')
  }
  switch (err.code) {
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    case 'LAND_NOT_FOUND':
      return t('game:factory.build.error.landNotFound')
    case 'LEVEL_LOCKED':
      return t('game:factory.build.error.levelLocked', { level: '?' })
    case 'INSUFFICIENT_MONEY':
      return t('game:factory.build.error.insufficientMoney', {
        required: '-',
        have: '-'
      })
    case 'INSUFFICIENT_MATERIAL': {
      const details = (err.details ?? {}) as {
        material?: string
        amount?: bigint | string
      }
      const materialCode = details.material ?? '-'
      const materialLabel =
        materialCode !== '-'
          ? t(`game:material.${materialCode}`, { defaultValue: materialCode })
          : '-'
      const amount = details.amount !== undefined ? String(details.amount) : '-'
      return t('game:factory.build.error.insufficientMaterial', {
        amount,
        material: materialLabel
      })
    }
    case 'SLOT_OCCUPIED':
      return t('game:factory.build.error.slotOccupied')
    case 'OUT_OF_BOUNDS':
      return t('game:factory.build.error.outOfBounds')
    default:
      logger.error(err)
      return t('game:common.error.unknown')
  }
}
