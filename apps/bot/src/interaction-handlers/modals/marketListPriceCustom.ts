/**
 * `/market list` 가격 직접 입력 Modal 핸들러.
 *
 * customId 포맷: `market:list:prc_m:<material>:<days>:<quantity>`
 *
 * 동작:
 * 1. customId 에서 material·days·quantity 추출
 * 2. price_per_unit TextInput 파싱
 * 3. 파싱 실패 시 ephemeral 오류 응답
 * 4. 성공 시 ephemeral 확인 UI (등록/취소 버튼) 응답
 *
 * Note: ModalSubmitInteraction 은 deferUpdate 지원 안 함 — reply() 로 새 ephemeral 응답 생성.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { type ModalSubmitInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import { MARKET_LIST_PRC_MODAL_PREFIX } from '../selects/marketListQuantity'
import { buildConfirmContainer } from '../selects/marketListPrice'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30'])

export class MarketListPriceCustomModalHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.ModalSubmit
    })
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(MARKET_LIST_PRC_MODAL_PREFIX)) {
      return this.none()
    }
    // 포맷: market:list:prc_m:<material>:<days>:<quantity>
    const rest = interaction.customId.slice(MARKET_LIST_PRC_MODAL_PREFIX.length)
    const parts = rest.split(':')
    if (parts.length < 3) return this.none()
    const [material, days, ...qtyParts] = parts
    if (!material || !days) return this.none()
    if (!VALID_MATERIALS.has(material)) return this.none()
    if (!VALID_DAYS.has(days)) return this.none()

    const quantity = qtyParts.join(':')
    if (!quantity || !/^\d+$/.test(quantity)) return this.none()

    return this.some({
      material: material as MaterialType,
      days,
      quantity
    })
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { material: MaterialType; days: string; quantity: string }
  ): Promise<void> {
    const t = await fetchT(interaction)
    const priceRaw = interaction.fields
      .getTextInputValue('price_per_unit')
      .trim()

    if (!/^\d+$/.test(priceRaw)) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.list.modal.error.invalidPrice'),
          ephemeral: true
        })
      )
      return
    }

    let price: bigint
    try {
      price = BigInt(priceRaw)
    } catch {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.list.modal.error.invalidPrice'),
          ephemeral: true
        })
      )
      return
    }

    if (price < 1n) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.list.modal.error.invalidPrice'),
          ephemeral: true
        })
      )
      return
    }

    const ownerId = interaction.user.id
    const container = buildConfirmContainer(
      ownerId,
      data.material,
      data.days,
      data.quantity,
      priceRaw,
      t
    )

    await interaction.reply({
      components: [container],
      flags: v2Flags(true)
    })
  }
}
