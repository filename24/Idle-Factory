/**
 * 상세 카드("자세히 보기")의 **매도 버튼** 핸들러 (#18).
 *
 * customId 포맷: `stock:sellmkt:<stockId>`
 *
 * 동작:
 * 1. customId 에서 종목 id 추출
 * 2. 종목(공장 종류) 조회 — 없으면 ephemeral 오류 응답
 * 3. 매도 수량 입력 Modal 을 `showModal()` 로 노출 (deferUpdate 없이 바로)
 *
 * 실제 매도 체결은 Modal 제출 핸들러(`stockSellQuantity`)가 담당한다. 매도
 * 버튼은 상세 카드에서 조회 유저가 보유(주수>0)한 종목에만 렌더되지만, 보유량
 * 재검증은 체결 시 서비스가 수행한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import {
  buildStockSellModal,
  STOCK_SELL_BUTTON_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { localizeFactoryType } from '../../utils/enumLocale'

export class StockSellButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(STOCK_SELL_BUTTON_PREFIX)) {
      return this.none()
    }
    const stockId = interaction.customId.slice(STOCK_SELL_BUTTON_PREFIX.length)
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
      buildStockSellModal(data.stockId, factoryLabel, t)
    )
  }
}
