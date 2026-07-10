/**
 * `/stock market` 시세 보드 종목별 **자세히 보기** 버튼 핸들러 (#18).
 *
 * customId 포맷: `stock:detail:<stockId>`
 *
 * 동작:
 * 1. customId 에서 종목 id 추출
 * 2. `StockService.getDetail` 로 현재가·등락·스파크라인·보유/평단/손익·상장자·
 *    상장가·배당률·발행/유통/상장 메타를 조회
 * 3. `buildStockInfoContainer(..., { buyButton: true })` 로 모든 정보 + 매수
 *    버튼을 담은 상세 카드를 ephemeral 로 응답
 *
 * 공개 보드의 버튼이지만 조회는 read-only 라 owner 게이팅 없이 누구나 볼 수
 * 있고, 응답은 클릭자에게만 보이도록 ephemeral 로 낸다(보드 메시지는 그대로).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import {
  buildStockInfoContainer,
  STOCK_DETAIL_BUTTON_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { ServiceError } from '../../services/base'
import { StockService } from '../../services/stock'

export class StockDetailButtonHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(STOCK_DETAIL_BUTTON_PREFIX)) {
      return this.none()
    }
    const stockId = interaction.customId.slice(
      STOCK_DETAIL_BUTTON_PREFIX.length
    )
    if (!stockId) return this.none()
    return this.some({ stockId })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { stockId: string }
  ): Promise<void> {
    const t = await fetchT(interaction)
    try {
      const view = await StockService.getDetail(this.container.db, {
        stockId: data.stockId,
        userId: interaction.user.id
      })
      const container = buildStockInfoContainer(view, t, { buyButton: true })
      await interaction.reply({ components: [container], flags: v2Flags(true) })
    } catch (err) {
      if (!(err instanceof ServiceError)) this.container.logger.error(err)
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:stock.error.notFound'),
          ephemeral: true
        })
      )
    }
  }
}
