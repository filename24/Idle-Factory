/**
 * `/stock market` 시세 보드 페이지 이동/새로고침 버튼 핸들러 (#18).
 *
 * customId 포맷: `stock:mkt:<ownerId>:<targetPage>`
 *  - 이전/다음: `targetPage = 현재 ± 1`
 *  - 새로고침: `targetPage = 현재 페이지` (최신 시세·보유량으로 재조회)
 *
 * 공개(non-ephemeral) 보드라 네비게이션은 보드 호출자 본인만 하도록
 * `assertInteractionOwner` 로 게이팅한다(매수 버튼은 누구나 가능 — 별도 핸들러).
 * 페이지 페이로드는 커맨드와 공유하는 `buildStockMarketPayload` 로 만들어
 * 같은 메시지를 `editReply` 로 교체한다(Components v2 정책상 새 메시지 금지).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import { STOCK_MARKET_NAV_PREFIX } from '@structures/renderers'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { buildStockMarketPayload } from '../../commands/game/stock'

export class StockMarketNavButtonHandler extends InteractionHandler {
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
    const parsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      STOCK_MARKET_NAV_PREFIX
    )
    if (!parsed) return this.none()
    const page = Number.parseInt(parsed.rest, 10)
    if (!Number.isInteger(page)) return this.none()
    return this.some({ ownerId: parsed.ownerId, page })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { ownerId: string; page: number }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const t = await fetchT(interaction)
    const payload = await buildStockMarketPayload(this.container.db, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      page: data.page,
      t
    })
    await interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }
}
