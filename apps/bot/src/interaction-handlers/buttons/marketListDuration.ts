/**
 * `/market list` 기간 선택 버튼 핸들러.
 *
 * customId 포맷: `market:list:dur:<ownerId>:<material>:<days>:<avgPriceStr>`
 *
 * 동작:
 * 1. parseOwnerPrefixedCustomId 로 ownerId 추출
 * 2. rest 에서 material · days · avgPriceStr 파싱
 * 3. assertInteractionOwner 로 본인 확인
 * 4. Modal 구성:
 *    - 프리셋(3/7/14/30일): quantity + price (avgPrice로 pre-fill)
 *    - custom: quantity + price (avgPrice pre-fill) + duration (기본값 "7")
 * 5. interaction.showModal() — deferUpdate() 없이 직접 호출
 *
 * Note: `MARKET_LIST_MODAL_PREFIX` 는 modals/marketListDetails.ts 와 공유한다.
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
  type ButtonInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { localizeMaterial } from '../../utils/enumLocale'

/** 기간 선택 버튼 customId prefix — marketListMaterial.ts 와 공유. */
export const MARKET_LIST_DUR_BUTTON_PREFIX = 'market:list:dur:'

/** Modal customId prefix — modals/marketListDetails.ts 와 공유. */
export const MARKET_LIST_MODAL_PREFIX = 'market:list:details:'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30', 'custom'])

export class MarketListDurationButtonHandler extends InteractionHandler {
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
      MARKET_LIST_DUR_BUTTON_PREFIX
    )
    if (!parsed) return this.none()

    // rest = <material>:<days>:<avgPriceStr>
    const firstColon = parsed.rest.indexOf(':')
    if (firstColon === -1) return this.none()
    const material = parsed.rest.slice(0, firstColon)
    const remainder = parsed.rest.slice(firstColon + 1)

    const secondColon = remainder.indexOf(':')
    if (secondColon === -1) return this.none()
    const days = remainder.slice(0, secondColon)
    const avgPriceStr = remainder.slice(secondColon + 1)

    if (!VALID_MATERIALS.has(material)) return this.none()
    if (!VALID_DAYS.has(days)) return this.none()

    return this.some({
      ownerId: parsed.ownerId,
      material: material as MaterialType,
      days,
      avgPriceStr
    })
  }

  public async run(
    interaction: ButtonInteraction,
    data: {
      ownerId: string
      material: MaterialType
      days: string
      avgPriceStr: string
    }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)
    const isCustom = data.days === 'custom'
    const avgPrice = data.avgPriceStr !== '0' ? data.avgPriceStr : undefined

    const priceInput = new TextInputBuilder()
      .setCustomId('price_per_unit')
      .setLabel(t('game:market.list.modal.priceLabel'))
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(20)
      .setRequired(true)

    if (avgPrice) {
      priceInput.setValue(avgPrice)
    } else {
      priceInput.setPlaceholder(t('game:market.list.modal.pricePlaceholder'))
    }

    const modal = new ModalBuilder()
      .setCustomId(`${MARKET_LIST_MODAL_PREFIX}${data.material}:${data.days}`)
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
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )

    if (isCustom) {
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('duration')
            .setLabel(t('game:market.list.modal.durationLabel'))
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(2)
            .setRequired(true)
            .setValue('7')
        )
      )
    }

    await interaction.showModal(modal)
  }
}
