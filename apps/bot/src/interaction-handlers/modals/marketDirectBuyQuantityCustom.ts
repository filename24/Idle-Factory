/**
 * `/market directbuy` 수량 직접 입력 Modal 핸들러 (#16).
 *
 * customId 포맷: `market:dbuy:qty_m:<material>`
 *
 * 동작:
 * 1. customId 에서 material 추출
 * 2. quantity TextInput 파싱 — 실패 시 ephemeral 오류 응답
 * 3. 시세·일일 한도 조회 후 구매 확인 UI (구매/취소 버튼) 를 ephemeral 로 응답
 *
 * Note: ModalSubmitInteraction 은 deferUpdate 지원 안 함 — reply() 로 새
 * ephemeral 응답 생성 (sell 플로우의 수량 Modal 과 동일 규약). 제출자는
 * 항상 본인이므로 ownerId 검증이 필요 없다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ModalSubmitInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { directBuyUnitPrice, isDirectBuyMaterial } from '@idle/game-core'
import {
  buildDirectBuyConfirmContainer,
  MARKET_DIRECT_BUY_QTY_MODAL_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { DirectBuyService } from '../../services/directBuy'
import { MarketPriceService } from '../../services/marketPrice'

export class MarketDirectBuyQuantityCustomModalHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(MARKET_DIRECT_BUY_QTY_MODAL_PREFIX)) {
      return this.none()
    }
    const material = interaction.customId.slice(
      MARKET_DIRECT_BUY_QTY_MODAL_PREFIX.length
    )
    if (!isDirectBuyMaterial(material as MaterialType)) return this.none()
    return this.some({ material: material as MaterialType })
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { material: MaterialType }
  ): Promise<void> {
    const t = await fetchT(interaction)
    const quantityRaw = interaction.fields.getTextInputValue('quantity').trim()

    // 일일 한도 최대치(10,000)가 상한이므로 6자리 정수만 유효하다.
    if (!/^\d{1,6}$/.test(quantityRaw)) {
      await this.replyInvalidQuantity(interaction, t)
      return
    }
    const quantity = BigInt(quantityRaw)
    if (quantity < 1n) {
      await this.replyInvalidQuantity(interaction, t)
      return
    }

    const { db } = this.container
    const [price, usage] = await Promise.all([
      MarketPriceService.getPrice(db, data.material),
      DirectBuyService.getDailyUsage(db, interaction.user.id)
    ])

    if (!price) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.directbuy.error.priceNotFound'),
          ephemeral: true
        })
      )
      return
    }

    if (quantity > BigInt(usage.remaining)) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:market.directbuy.error.dailyLimitExceeded', {
            remaining: usage.remaining.toLocaleString('en-US'),
            limit: usage.limit.toLocaleString('en-US'),
            resetUnix: Math.floor(usage.resetsAt.getTime() / 1000)
          }),
          ephemeral: true
        })
      )
      return
    }

    const container = buildDirectBuyConfirmContainer(
      interaction.user.id,
      data.material,
      quantity,
      directBuyUnitPrice(price.currentPrice),
      usage,
      t
    )
    await interaction.reply({ components: [container], flags: v2Flags(true) })
  }

  /** 수량 형식 오류 공통 응답. */
  private async replyInvalidQuantity(
    interaction: ModalSubmitInteraction,
    t: Awaited<ReturnType<typeof fetchT>>
  ): Promise<void> {
    await interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: t('game:market.directbuy.modal.error.invalidQuantity'),
        ephemeral: true
      })
    )
  }
}
