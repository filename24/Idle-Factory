/**
 * 공장 앵커 셀 클릭 이후 노출되는 액션 버튼 라우터 (Phase 2 step 4c/4d).
 *
 * customId 포맷: `factory:action:<factoryId>:<verb>`
 *   verb ∈ {info, harvest, upgrade, destroy}
 *
 * 각 verb는 해당 서비스를 호출하고 결과를 같은 메시지에 update 로 반영한다.
 * destroy 는 Phase 2 step 4d에서 2단계 확인 UX로 확장된다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { FACTORY_CATALOG, type MaterialType } from '@idle/game-core'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  type ButtonInteraction,
  type InteractionUpdateOptions
} from 'discord.js'
import { formatBigInt, renderFactoryInfo } from '@structures/renderers'
import {
  FACTORY_ACTION_BUTTON_PREFIX,
  LAND_VIEW_BUTTON_PREFIX,
  buildLandViewPayload
} from '../../commands/game/land'
import { FactoryService } from '../../services/factory'
import { HarvestService } from '../../services/harvest'
import { ServiceError } from '../../services/base'

type Verb = 'info' | 'harvest' | 'upgrade' | 'destroy'

const VERBS: readonly Verb[] = ['info', 'harvest', 'upgrade', 'destroy']

function isVerb(value: string): value is Verb {
  return (VERBS as readonly string[]).includes(value)
}

export class FactoryActionButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(FACTORY_ACTION_BUTTON_PREFIX)) {
      return this.none()
    }
    const rest = interaction.customId.slice(FACTORY_ACTION_BUTTON_PREFIX.length)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon <= 0) return this.none()
    const factoryId = rest.slice(0, lastColon)
    const verb = rest.slice(lastColon + 1)
    if (!isVerb(verb)) return this.none()
    return this.some({ factoryId, verb })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { factoryId: string; verb: Verb }
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    switch (data.verb) {
      case 'info':
        return this.handleInfo(interaction, data.factoryId, t)
      case 'harvest':
        return this.handleHarvest(interaction, data.factoryId, t)
      case 'upgrade':
        return this.handleUpgrade(interaction, data.factoryId, t)
      case 'destroy':
        // Phase 2 step 4d에서 2단계 확인 UX 추가 예정.
        await interaction.reply({
          components: [
            simpleContainer(
              V2_ACCENT.warn,
              undefined,
              t('game:land.view.cellComingSoon')
            )
          ],
          flags: v2Flags(true)
        })
        return
      default:
        void db
    }
  }

  /** 공장 info 응답 + "돌아가기" 버튼. */
  private async handleInfo(
    interaction: ButtonInteraction,
    factoryId: string,
    t: TFunction
  ): Promise<void> {
    const { db } = this.container
    try {
      const info = await FactoryService.info(db, factoryId)
      const entry = FACTORY_CATALOG[info.type]
      const nextCost =
        info.nextUpgradeCost.money !== null &&
        info.nextUpgradeCost.material !== null
          ? {
              money: info.nextUpgradeCost.money,
              material: info.nextUpgradeCost.material.material as MaterialType,
              amount: info.nextUpgradeCost.material.amount
            }
          : null
      const landIndex = await this.getLandIndex(factoryId)
      const container = simpleContainer(
        V2_ACCENT.info,
        t('game:factory.info.title', {
          emoji: entry.emoji,
          type: info.type,
          grade: info.grade
        }),
        renderFactoryInfo(info, entry, nextCost)
      )
      container.addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${landIndex}`)
            .setLabel(t('game:land.factory.actionBack'))
            .setStyle(ButtonStyle.Secondary)
        )
      )
      await interaction.update({
        components: [container],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
      } as InteractionUpdateOptions)
    } catch (err) {
      await this.replyWarn(
        interaction,
        resolveFactoryErrorBody(err, t, this.container.logger)
      )
    }
  }

  /** 단일 공장 수확 → 결과 ephemeral followUp + 갱신된 그리드로 update. */
  private async handleHarvest(
    interaction: ButtonInteraction,
    factoryId: string,
    t: TFunction
  ): Promise<void> {
    const { db } = this.container
    try {
      const result = await HarvestService.harvestOne(db, {
        userId: interaction.user.id,
        factoryId
      })
      const landIndex = await this.getLandIndex(factoryId)
      const payload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: landIndex,
        t
      })
      await interaction.update(payload as InteractionUpdateOptions)
      const ticks = result.factories.reduce((acc, f) => acc + f.ticks, 0)
      const body =
        ticks > 0
          ? t('game:land.factory.harvestSuccess', {
              ticks,
              xp: formatBigInt(result.xpGained)
            })
          : t('game:land.factory.harvestEmpty')
      await interaction.followUp({
        components: [simpleContainer(V2_ACCENT.success, undefined, body)],
        flags: v2Flags(true)
      })
    } catch (err) {
      await this.replyWarn(
        interaction,
        resolveFactoryErrorBody(err, t, this.container.logger)
      )
    }
  }

  /** 공장 업그레이드 → 성공 시 followUp + 그리드 복귀. */
  private async handleUpgrade(
    interaction: ButtonInteraction,
    factoryId: string,
    t: TFunction
  ): Promise<void> {
    const { db } = this.container
    try {
      const updated = await FactoryService.upgrade(db, {
        userId: interaction.user.id,
        factoryId
      })
      const landIndex = await this.getLandIndex(factoryId)
      const payload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: landIndex,
        t
      })
      await interaction.update(payload as InteractionUpdateOptions)
      await interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.factory.upgradeSuccess', { grade: updated.grade })
          )
        ],
        flags: v2Flags(true)
      })
    } catch (err) {
      await this.replyWarn(
        interaction,
        resolveFactoryErrorBody(err, t, this.container.logger)
      )
    }
  }

  /** factoryId → 해당 공장의 소속 토지 index. 실패 시 1로 폴백. */
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

/** 공장 액션에서 던져진 `ServiceError`를 i18n 문구로 매핑한다. */
function resolveFactoryErrorBody(
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
    case 'WAREHOUSE_FULL':
      return t('game:common.error.warehouseFull')
    case 'MAX_GRADE':
      return t('game:factory.upgrade.error.maxGrade')
    case 'INSUFFICIENT_MONEY':
      return t('game:factory.upgrade.error.insufficientMoney', {
        required: '-'
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
      return t('game:factory.upgrade.error.insufficientMaterial', {
        amount,
        material: materialLabel
      })
    }
    default:
      logger.error(err)
      return t('game:common.error.unknown')
  }
}
