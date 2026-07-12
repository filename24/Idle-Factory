/**
 * 상세 카드 매도 수량 입력 Modal 제출 핸들러 (#18) — 매수 Modal 과 대칭.
 *
 * customId 포맷: `stock:sellqty:<stockId>`
 *
 * 동작:
 * 1. customId 에서 종목 id, `shares` TextInput 에서 매도 주수 추출
 * 2. 수량 형식 검증(1~6자리 정수) — 실패 시 ephemeral 오류
 * 3. `StockService.sell` 로 체결 — 레벨/자기거래/rate limit/보유량 가드는 서비스가
 *    담당하며, 도메인 에러는 `resolveStockErrorMessage` 로 변환. 수익 실현 시
 *    XP +10 지급으로 레벨업하면 안내를 덧붙인다.
 * 4. 성공/실패 모두 ephemeral Components v2 로 응답 (상세 카드는 그대로)
 *
 * Note: ModalSubmitInteraction 은 deferUpdate 미지원 — reply() 로 새 ephemeral
 * 응답을 만든다. 제출자는 항상 본인이므로 ownerId 검증이 필요 없다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ModalSubmitInteraction } from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import {
  formatBigInt,
  STOCK_SELL_QTY_MODAL_PREFIX
} from '@structures/renderers'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { resolveStockErrorMessage } from '@utils/stockErrorKey'
import { localizeFactoryType } from '../../utils/enumLocale'
import { StockService } from '../../services/stock'
import { UserService } from '../../services/user'

export class StockSellQuantityModalHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(STOCK_SELL_QTY_MODAL_PREFIX)) {
      return this.none()
    }
    const stockId = interaction.customId.slice(
      STOCK_SELL_QTY_MODAL_PREFIX.length
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

    // 보유 주수는 6자리 안이므로 1~6자리 정수만 유효하다.
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
      const result = await StockService.sell(db, {
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

      const bodyParts = [
        t('game:stock.sell.footer', {
          price: formatBigInt(result.unitPrice),
          total: formatBigInt(result.totalPaid),
          remaining: formatBigInt(BigInt(result.remainingShares))
        })
      ]
      if (result.leveledUp) {
        bodyParts.push(
          t('game:stock.sell.levelUp', {
            level: result.newLevel,
            xp: result.xpAwarded.toString()
          })
        )
      }

      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:stock.sell.success', {
            stock: factoryLabel,
            shares: formatBigInt(BigInt(result.shares))
          }),
          body: bodyParts.join('\n'),
          ephemeral: true
        })
      )
    } catch (err) {
      if (!isKnownServiceError(err)) this.container.logger.error(err)
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: resolveStockErrorMessage(err, 'sell', t),
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
