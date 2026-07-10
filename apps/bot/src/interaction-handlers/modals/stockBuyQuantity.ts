/**
 * `/stock market` 매수 수량 입력 Modal 제출 핸들러 (#18).
 *
 * customId 포맷: `stock:buyqty:<stockId>`
 *
 * 동작:
 * 1. customId 에서 종목 id, `shares` TextInput 에서 매수 주수 추출
 * 2. 수량 형식 검증(1~6자리 정수) — 실패 시 ephemeral 오류
 * 3. `StockService.buy` 로 체결 — 레벨/자기거래/rate limit/유통상한/잔액 가드는
 *    서비스가 담당하며, 도메인 에러는 `resolveStockErrorMessage` 로 변환
 * 4. 성공/실패 모두 ephemeral Components v2 로 응답 (보드 메시지는 그대로)
 *
 * Note: ModalSubmitInteraction 은 deferUpdate 미지원 — reply() 로 새 ephemeral
 * 응답을 만든다(market direct-buy 수량 Modal 과 동일 규약). 제출자는 항상
 * 본인이므로 ownerId 검증이 필요 없다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ModalSubmitInteraction } from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import { formatBigInt, STOCK_BUY_QTY_MODAL_PREFIX } from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { resolveStockErrorMessage } from '@utils/stockErrorKey'
import { localizeFactoryType } from '../../utils/enumLocale'
import { StockService } from '../../services/stock'
import { UserService } from '../../services/user'

export class StockBuyQuantityModalHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(STOCK_BUY_QTY_MODAL_PREFIX)) {
      return this.none()
    }
    const stockId = interaction.customId.slice(
      STOCK_BUY_QTY_MODAL_PREFIX.length
    )
    if (!stockId) return this.none()
    return this.some({ stockId })
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: { stockId: string }
  ): Promise<void> {
    const t = await fetchT(interaction)
    const raw = interaction.fields.getTextInputValue('shares').trim()

    // 발행 주수 상한이 6자리 안이므로 1~6자리 정수만 유효하다.
    if (!/^\d{1,6}$/.test(raw) || BigInt(raw) < 1n) {
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:stock.error.invalidQuantity'),
          ephemeral: true
        })
      )
      return
    }
    const shares = Number(raw)
    const { db } = this.container

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await StockService.buy(db, {
        userId: interaction.user.id,
        stockId: data.stockId,
        shares,
        guildId: interaction.guildId
      })

      const stock = await db.stock.findUnique({
        where: { id: data.stockId },
        select: { factory: { select: { type: true } } }
      })
      const factoryLabel = stock
        ? localizeFactoryType(t, stock.factory.type as FactoryType)
        : `#${data.stockId.slice(-6)}`

      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:stock.buy.success', {
            stock: factoryLabel,
            shares: formatBigInt(BigInt(result.shares))
          }),
          footer: t('game:stock.buy.footer', {
            price: formatBigInt(result.unitPrice),
            total: formatBigInt(result.totalCost),
            holding: formatBigInt(BigInt(result.holdingShares)),
            avg: formatBigInt(result.avgBuyPrice)
          }),
          ephemeral: true
        })
      )
    } catch (err) {
      if (!isKnownServiceError(err)) this.container.logger.error(err)
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: resolveStockErrorMessage(err, 'buy', t),
          ephemeral: true
        })
      )
    }
  }
}

/** ServiceError(도메인 에러) 여부 — 예상 밖 에러만 로깅하기 위한 판별. */
function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}
