/**
 * 3/5/7/10등급 도달 시 노출되는 부스터 4지선다 Select 핸들러.
 *
 * customId 포맷: `factory:booster:<ownerId>:<factoryId>`.
 * 선택 value 는 `UpgradeBooster` (SAVING/RARE/SPEED/PROFIT).
 * 확정 시 `FactoryService.chooseBooster` 로 `Factory.upgradeBooster` 를 갱신하고
 * 같은 메시지를 확정 컨테이너로 교체한다.
 *
 * 참조: `docs/design/03-factories.md` §업그레이드 부스터 선택 시스템, #19.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import type { UpgradeBooster } from '@idle/game-core'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import {
  FACTORY_BOOSTER_SELECT_PREFIX,
  UPGRADE_BOOSTER_EMOJI
} from '@structures/renderers'
import { FactoryService } from '../../services/factory'
import { ServiceError } from '../../services/base'
import { localizeUpgradeBooster } from '../../utils/enumLocale'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

const VALID_BOOSTERS: ReadonlySet<string> = new Set([
  'SAVING',
  'RARE',
  'SPEED',
  'PROFIT'
])

export class FactoryBoosterSelectHandler extends InteractionHandler {
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
      FACTORY_BOOSTER_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const factoryId = parsed.rest
    const value = interaction.values[0]
    if (!factoryId || !value || !VALID_BOOSTERS.has(value)) {
      return this.none()
    }
    return this.some({
      ownerId: parsed.ownerId,
      factoryId,
      booster: value as UpgradeBooster
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; factoryId: string; booster: UpgradeBooster }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    try {
      await FactoryService.chooseBooster(db, {
        userId: interaction.user.id,
        factoryId: data.factoryId,
        booster: data.booster
      })
      await interaction.editReply({
        components: [
          simpleContainer(
            V2_ACCENT.rare,
            undefined,
            t('game:factory.boosterChoice.applied', {
              emoji: UPGRADE_BOOSTER_EMOJI[data.booster],
              booster: localizeUpgradeBooster(t, data.booster)
            })
          )
        ]
      })
    } catch (err) {
      await interaction.editReply({
        components: [
          simpleContainer(V2_ACCENT.warn, undefined, this.errorBody(err, t))
        ]
      })
    }
  }

  /** `ServiceError` → i18n 본문. 알 수 없는 오류는 로그 후 공통 문구. */
  private errorBody(err: unknown, t: TFunction): string {
    if (!(err instanceof ServiceError)) {
      this.container.logger.error(err)
      return t('game:common.error.unknown')
    }
    switch (err.code) {
      case 'BOOSTER_NOT_AVAILABLE':
        return t('game:factory.boosterChoice.error.notAvailable')
      case 'FACTORY_NOT_FOUND':
        return t('game:common.error.factoryNotFound')
      default:
        this.container.logger.error(err)
        return t('game:common.error.unknown')
    }
  }
}
