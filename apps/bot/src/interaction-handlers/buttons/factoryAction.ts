/**
 * 공장 앵커 셀 클릭 이후 노출되는 액션 버튼 라우터 (Phase 2 step 4c/4d).
 *
 * customId 포맷: `factory:action:<ownerId>:<factoryId>:<verb>`
 *   verb ∈ { harvest, upgrade, destroy } — info 는 액션 메뉴 본문에 즉시 표시되어 제거됨.
 *
 * 각 verb는 해당 서비스를 호출하고 결과를 같은 메시지에 update 로 반영한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { buildCost } from '@idle/game-core'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { appendQuestCompletions } from '@utils/questNotifier'
import type { ButtonInteraction } from 'discord.js'
import { formatBigInt } from '@structures/renderers'
import {
  FACTORY_ACTION_BUTTON_PREFIX,
  buildDestroyConfirmPayload,
  buildLandViewPayload
} from '../../commands/game/land'
import { FactoryService } from '../../services/factory'
import { HarvestService } from '../../services/harvest'
import { ServiceError } from '../../services/base'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

type Verb = 'harvest' | 'upgrade' | 'destroy'

const VERBS: readonly Verb[] = ['harvest', 'upgrade', 'destroy']

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
    const parsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      FACTORY_ACTION_BUTTON_PREFIX
    )
    if (!parsed) return this.none()
    const lastColon = parsed.rest.lastIndexOf(':')
    if (lastColon <= 0) return this.none()
    const factoryId = parsed.rest.slice(0, lastColon)
    const verb = parsed.rest.slice(lastColon + 1)
    if (!isVerb(verb)) return this.none()
    return this.some({ ownerId: parsed.ownerId, factoryId, verb })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { ownerId: string; factoryId: string; verb: Verb }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return
    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    switch (data.verb) {
      case 'harvest':
        return this.handleHarvest(interaction, data.factoryId, t)
      case 'upgrade':
        return this.handleUpgrade(interaction, data.factoryId, t)
      case 'destroy':
        return this.handleDestroyPrompt(interaction, data.factoryId, t)
      default:
        void db
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
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
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
        flags: v2Flags(false)
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
      const { factory: updated, quest } = await FactoryService.upgrade(db, {
        userId: interaction.user.id,
        factoryId
      })
      const landIndex = await this.getLandIndex(factoryId)
      const payload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: landIndex,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      const followBase = {
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.factory.upgradeSuccess', { grade: updated.grade })
          )
        ],
        flags: v2Flags(false)
      }
      await interaction.followUp(appendQuestCompletions(followBase, quest, t))
    } catch (err) {
      await this.replyWarn(
        interaction,
        resolveFactoryErrorBody(err, t, this.container.logger)
      )
    }
  }

  /** 공장 철거 2단계 확인 UX 렌더. 실제 삭제는 `factoryDestroy.ts` 핸들러가 처리. */
  private async handleDestroyPrompt(
    interaction: ButtonInteraction,
    factoryId: string,
    t: TFunction
  ): Promise<void> {
    const factoryRow = await this.container.db.factory.findUnique({
      where: { id: factoryId },
      select: { userId: true, type: true }
    })
    if (!factoryRow || factoryRow.userId !== interaction.user.id) {
      await this.replyWarn(interaction, t('game:common.error.factoryNotFound'))
      return
    }
    const payload = buildDestroyConfirmPayload({
      ownerId: interaction.user.id,
      factoryId,
      factoryType: factoryRow.type,
      refund: buildCost(factoryRow.type) / 2n,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }

  /** factoryId → 해당 공장의 소속 토지 index. 실패 시 1로 폴백. */
  private async getLandIndex(factoryId: string): Promise<number> {
    const slot = await this.container.db.slot.findFirst({
      where: { factoryId },
      select: { land: { select: { index: true } } }
    })
    return slot?.land?.index ?? 1
  }

  private async replyWarn(
    interaction: ButtonInteraction,
    body: string
  ): Promise<void> {
    await interaction.editReply({
      components: [simpleContainer(V2_ACCENT.warn, undefined, body)]
    })
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
    case 'INSUFFICIENT_MONEY': {
      const det = (err.details ?? {}) as {
        required?: string
        have?: string
      }
      return t('game:factory.upgrade.error.insufficientMoney', {
        required: det.required ?? '-',
        have: det.have ?? '-'
      })
    }
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
