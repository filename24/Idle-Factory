/**
 * `/market directbuy` 자재 Select Menu 핸들러 (#16).
 *
 * customId 포맷: `market:dbuy:mat:<ownerId>:_`
 *
 * 동작:
 * 1. parseOwnerPrefixedCustomId 로 ownerId 추출 + assertInteractionOwner
 * 2. deferUpdate() — DB 조회 전 응답 타임아웃 방어
 * 3. 글로벌 시세(×2 할증 단가) + 일일 한도 사용 현황 조회
 * 4. 수량 Select UI 로 editReply (한도 소진이면 안내, 시세 없으면 오류)
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
  buildDirectBuyQuantityContainer,
  MARKET_DIRECT_BUY_MATERIAL_SELECT_PREFIX
} from '@structures/renderers'
import { simpleContainer, V2_ACCENT, v2EditPayload } from '@utils/ComponentsV2'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { DirectBuyService } from '../../services/directBuy'
import { MarketPriceService } from '../../services/marketPrice'

export class MarketDirectBuyMaterialSelectHandler extends InteractionHandler {
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
      MARKET_DIRECT_BUY_MATERIAL_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const value = interaction.values[0]
    if (!value || !isDirectBuyMaterial(value as MaterialType)) {
      return this.none()
    }
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

    const [price, usage] = await Promise.all([
      MarketPriceService.getPrice(db, data.material),
      DirectBuyService.getDailyUsage(db, data.ownerId)
    ])

    // 시드 누락 방어 — 시세 행이 없으면 직구매 진행 불가.
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

    // 오늘 한도 소진 — 수량 단계로 넘어갈 수 없다.
    if (usage.remaining <= 0) {
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            t('game:market.directbuy.error.limitReached', {
              limit: usage.limit.toLocaleString('en-US'),
              resetUnix: Math.floor(usage.resetsAt.getTime() / 1000)
            })
          )
        ])
      )
      return
    }

    const container = buildDirectBuyQuantityContainer(
      data.ownerId,
      data.material,
      directBuyUnitPrice(price.currentPrice),
      usage,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
