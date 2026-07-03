/**
 * `/market sell` 수량 Select Menu 핸들러.
 *
 * customId 포맷: `market:sell:qty:<ownerId>:<material>`
 *
 * 동작:
 * - 프리셋/전량 수량 선택 시: deferUpdate → 보유량·시세 재확인 → 판매 확인 UI
 * - "직접 입력" 선택 시: showModal() — 수량 Modal (deferUpdate 없이)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  buildSellConfirmContainer,
  buildSellQuantityModal,
  MARKET_SELL_QTY_SELECT_PREFIX
} from '@structures/renderers'
import { simpleContainer, V2_ACCENT, v2EditPayload } from '@utils/ComponentsV2'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { MarketPriceService } from '../../services/marketPrice'
import { MarketSellService } from '../../services/marketSell'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

export class MarketSellQuantitySelectHandler extends InteractionHandler {
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
      MARKET_SELL_QTY_SELECT_PREFIX
    )
    if (!parsed) return this.none()

    const material = parsed.rest
    if (!VALID_MATERIALS.has(material)) return this.none()

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
      await interaction.showModal(buildSellQuantityModal(data.material, t))
      return
    }

    if (!/^\d+$/.test(data.selectedQty)) return
    const quantity = BigInt(data.selectedQty)
    if (quantity < 1n) return

    const { db } = this.container
    await interaction.deferUpdate()

    const [stacks, price] = await Promise.all([
      MarketSellService.listSellableStacks(db, data.ownerId, [data.material]),
      MarketPriceService.getPrice(db, data.material)
    ])

    if (!price) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:market.sell.error.priceNotFound')
          )
        ])
      )
      return
    }

    // 선택 시점 보유량 재확인 — 수확/판매 경합으로 줄었을 수 있다.
    const holding = stacks[0]?.count ?? 0n
    if (quantity > holding) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:market.sell.error.insufficientStock', {
              required: quantity.toString(),
              have: holding.toString()
            })
          )
        ])
      )
      return
    }

    const container = buildSellConfirmContainer(
      data.ownerId,
      data.material,
      quantity,
      price.currentPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
