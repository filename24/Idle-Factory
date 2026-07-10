/**
 * `/stock market` 시세 보드의 종목별 **매수 버튼** 핸들러 (#18).
 *
 * customId 포맷: `stock:buymkt:<stockId>`
 *
 * 동작:
 * 1. customId 에서 종목 id 추출
 * 2. 종목(공장 종류) 조회 — 없으면 ephemeral 오류 응답
 * 3. 수량 입력 Modal 을 `showModal()` 로 노출 (deferUpdate 없이 바로)
 *
 * 실제 매수 체결은 Modal 제출 핸들러(`stockBuyQuantity`)가 담당한다. 보드
 * 메시지는 그대로 두고, 매수 결과는 제출자에게 ephemeral 로 응답한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import {
  buildStockBuyModal,
  STOCK_BUY_BUTTON_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { localizeFactoryType } from '../../utils/enumLocale'

export class StockBuyButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(STOCK_BUY_BUTTON_PREFIX)) {
      return this.none()
    }
    const stockId = interaction.customId.slice(STOCK_BUY_BUTTON_PREFIX.length)
    if (!stockId) return this.none()
    return this.some({ stockId })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { stockId: string }
  ): Promise<void> {
    const t = await fetchT(interaction)
    const stock = await this.container.db.stock.findUnique({
      where: { id: data.stockId },
      select: { factory: { select: { type: true } } }
    })

    if (!stock) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:stock.error.notFound'),
          ephemeral: true
        })
      )
      return
    }

    const factoryLabel = localizeFactoryType(
      t,
      stock.factory.type as FactoryType
    )
    // ModalSubmit 은 deferUpdate 불가 — 버튼에서 바로 showModal.
    await interaction.showModal(
      buildStockBuyModal(data.stockId, factoryLabel, t)
    )
  }
}
