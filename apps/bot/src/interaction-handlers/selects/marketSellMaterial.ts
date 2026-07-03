/**
 * `/market sell` 자재 Select Menu 핸들러.
 *
 * customId 포맷: `market:sell:mat:<ownerId>:_`
 *
 * 동작:
 * 1. parseOwnerPrefixedCustomId 로 ownerId 추출 + assertInteractionOwner
 * 2. deferUpdate() — DB 조회 전 응답 타임아웃 방어
 * 3. 창고 보유량 + 글로벌 시세 조회
 * 4. 수량 Select UI 로 editReply (보유 0 이면 안내, 시세 없으면 오류)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  buildSellQuantityContainer,
  MARKET_SELL_MATERIAL_SELECT_PREFIX
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

export class MarketSellMaterialSelectHandler extends InteractionHandler {
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
      MARKET_SELL_MATERIAL_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const value = interaction.values[0]
    if (!value || !VALID_MATERIALS.has(value)) return this.none()
    return this.some({
      ownerId: parsed.ownerId,
      material: value as MaterialType
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; material: MaterialType }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const { db } = this.container
    await interaction.deferUpdate()
    const t = await fetchT(interaction)

    const [stacks, price] = await Promise.all([
      MarketSellService.listSellableStacks(db, data.ownerId, [data.material]),
      MarketPriceService.getPrice(db, data.material)
    ])

    // 시드 누락 방어 — 시세 행이 없으면 판매 진행 불가.
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

    const holding = stacks[0]?.count ?? 0n
    if (holding <= 0n) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            t('game:market.sell.selectMaterial.empty')
          )
        ])
      )
      return
    }

    const container = buildSellQuantityContainer(
      data.ownerId,
      data.material,
      holding,
      price.currentPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
