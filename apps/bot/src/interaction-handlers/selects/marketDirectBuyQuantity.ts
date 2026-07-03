/**
 * `/market directbuy` 수량 Select Menu 핸들러 (#16).
 *
 * customId 포맷: `market:dbuy:qty:<ownerId>:<material>`
 *
 * 동작:
 * - 프리셋/전량 수량 선택 시: deferUpdate → 시세·한도 재확인 → 구매 확인 UI
 * - "직접 입력" 선택 시: showModal() — 수량 Modal (deferUpdate 없이)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { directBuyUnitPrice, isDirectBuyMaterial } from '@idle/game-core'
import {
  buildDirectBuyConfirmContainer,
  buildDirectBuyQuantityModal,
  MARKET_DIRECT_BUY_QTY_SELECT_PREFIX
} from '@structures/renderers'
import { simpleContainer, V2_ACCENT, v2EditPayload } from '@utils/ComponentsV2'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { DirectBuyService } from '../../services/directBuy'
import { MarketPriceService } from '../../services/marketPrice'

export class MarketDirectBuyQuantitySelectHandler extends InteractionHandler {
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
      MARKET_DIRECT_BUY_QTY_SELECT_PREFIX
    )
    if (!parsed) return this.none()

    const material = parsed.rest
    if (!isDirectBuyMaterial(material as MaterialType)) return this.none()

    const selectedQty = interaction.values[0]
    if (!selectedQty) return this.none()

    return this.some({
      ownerId: parsed.ownerId,
      material: material as MaterialType,
      selectedQty
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; material: MaterialType; selectedQty: string }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    if (data.selectedQty === 'custom') {
      // 직접 입력: 수량 Modal — deferUpdate 호출 없이 바로 showModal
      await interaction.showModal(buildDirectBuyQuantityModal(data.material, t))
      return
    }

    if (!/^\d+$/.test(data.selectedQty)) return
    const quantity = BigInt(data.selectedQty)
    if (quantity < 1n) return

    const { db } = this.container
    await interaction.deferUpdate()

    const [price, usage] = await Promise.all([
      MarketPriceService.getPrice(db, data.material),
      DirectBuyService.getDailyUsage(db, data.ownerId)
    ])

    if (!price) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:market.directbuy.error.priceNotFound')
          )
        ])
      )
      return
    }

    // 선택 시점 한도 재확인 — 다른 채널의 병행 구매로 줄었을 수 있다.
    if (quantity > BigInt(usage.remaining)) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:market.directbuy.error.dailyLimitExceeded', {
              remaining: usage.remaining.toLocaleString('en-US'),
              limit: usage.limit.toLocaleString('en-US'),
              resetUnix: Math.floor(usage.resetsAt.getTime() / 1000)
            })
          )
        ])
      )
      return
    }

    const container = buildDirectBuyConfirmContainer(
      data.ownerId,
      data.material,
      quantity,
      directBuyUnitPrice(price.currentPrice),
      usage,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
