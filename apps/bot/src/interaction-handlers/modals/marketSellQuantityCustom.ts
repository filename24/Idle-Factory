/**
 * `/market sell` 수량 직접 입력 Modal 핸들러.
 *
 * customId 포맷: `market:sell:qty_m:<material>`
 *
 * 동작:
 * 1. customId 에서 material 추출
 * 2. quantity TextInput 파싱 — 실패 시 ephemeral 오류 응답
 * 3. 글로벌 시세 조회 후 판매 확인 UI (판매/취소 버튼) 를 ephemeral 로 응답
 *
 * Note: ModalSubmitInteraction 은 deferUpdate 지원 안 함 — reply() 로 새
 * ephemeral 응답 생성 (list 플로우의 가격 Modal 과 동일 규약). 제출자는
 * 항상 본인이므로 ownerId 검증이 필요 없다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ModalSubmitInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  buildSellConfirmContainer,
  MARKET_SELL_QTY_MODAL_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import { MarketPriceService } from '../../services/marketPrice'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

export class MarketSellQuantityCustomModalHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(MARKET_SELL_QTY_MODAL_PREFIX)) {
      return this.none()
    }
    const material = interaction.customId.slice(
      MARKET_SELL_QTY_MODAL_PREFIX.length
    )
    if (!VALID_MATERIALS.has(material)) return this.none()
    return this.some({ material: material as MaterialType })
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { material: MaterialType }
  ): Promise<void> {
    const t = await fetchT(interaction)
    const quantityRaw = interaction.fields.getTextInputValue('quantity').trim()

    if (!/^\d+$/.test(quantityRaw)) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.sell.modal.error.invalidQuantity'),
          ephemeral: true
        })
      )
      return
    }

    let quantity: bigint
    try {
      quantity = BigInt(quantityRaw)
    } catch {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.sell.modal.error.invalidQuantity'),
          ephemeral: true
        })
      )
      return
    }

    if (quantity < 1n) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.sell.modal.error.invalidQuantity'),
          ephemeral: true
        })
      )
      return
    }

    const price = await MarketPriceService.getPrice(
      this.container.db,
      data.material
    )
    if (!price) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.sell.error.priceNotFound'),
          ephemeral: true
        })
      )
      return
    }

    const container = buildSellConfirmContainer(
      interaction.user.id,
      data.material,
      quantity,
      price.currentPrice,
      t
    )
    await interaction.reply({ components: [container], flags: v2Flags(true) })
  }
}
