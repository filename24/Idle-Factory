/**
 * `/market list` 자재 Select Menu 핸들러.
 *
 * customId 포맷: `market:list:mat:<ownerId>:_`
 *
 * 동작:
 * 1. parseOwnerPrefixedCustomId 로 ownerId 추출
 * 2. assertInteractionOwner 로 본인 확인
 * 3. 선택된 자재 값을 Modal customId 에 인코딩
 * 4. interaction.showModal() 로 수량·가격·기간 입력 Modal 표시
 *
 * Note: deferUpdate() 와 showModal() 은 공존 불가 — showModal 이 응답을 소비하므로
 * run() 내에서 deferUpdate 를 호출하지 않는다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  MATERIAL_CHOICES,
  MARKET_LIST_MATERIAL_SELECT_PREFIX
} from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { localizeMaterial } from '../../utils/enumLocale'

/** Modal customId prefix — modals/marketListDetails.ts 와 공유. */
export const MARKET_LIST_MODAL_PREFIX = 'market:list:details:'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

export class MarketListMaterialSelectHandler extends InteractionHandler {
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
      MARKET_LIST_MATERIAL_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const value = interaction.values[0]
    if (!value || !VALID_MATERIALS.has(value)) return this.none()
    return this.some({
      ownerId: parsed.ownerId,
      material: value as MaterialType
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; material: MaterialType }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    const modal = new ModalBuilder()
      .setCustomId(`${MARKET_LIST_MODAL_PREFIX}${data.material}`)
      .setTitle(
        t('game:market.list.modal.title', {
          material: localizeMaterial(t, data.material)
        })
      )

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(t('game:market.list.modal.quantityLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:market.list.modal.quantityPlaceholder'))
          .setMinLength(1)
          .setMaxLength(20)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('price_per_unit')
          .setLabel(t('game:market.list.modal.priceLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:market.list.modal.pricePlaceholder'))
          .setMinLength(1)
          .setMaxLength(20)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel(t('game:market.list.modal.durationLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:market.list.modal.durationPlaceholder'))
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
      )
    )

    await interaction.showModal(modal)
  }
}
