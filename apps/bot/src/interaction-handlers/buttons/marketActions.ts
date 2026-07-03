/**
 * `/market` 응답에 부착된 버튼 핸들러.
 *
 * customId 포맷:
 *   `market:buy:<listingId>`           — 매물 구매
 *   `market:cancel:<listingId>`        — 본인 매물 취소
 *   `market:browse:<material|_>:<page>` — browse 페이지 이동
 *
 * 클릭자 본인 검증은 서비스 레이어(`MarketService.buy/cancel`)가 담당한다
 * (NOT_LISTING_OWNER / SELF_PURCHASE 등). 핸들러는 라우팅과 응답 갱신만 책임진다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { resolveMarketErrorMessage } from '@utils/marketErrorKey'
import { localizeMaterial } from '../../utils/enumLocale'
import { MarketService } from '../../services/market'
import { UserService } from '../../services/user'
import {
  buildBrowseContainer,
  logMarketBuySignal,
  resolveMarketActor,
  MARKET_BROWSE_BUTTON_PREFIX,
  MARKET_BUY_BUTTON_PREFIX,
  MARKET_CANCEL_BUTTON_PREFIX
} from '../../commands/game/market'

const BROWSE_PAGE_SIZE = 5

type Parsed =
  | { kind: 'buy'; listingId: string }
  | { kind: 'cancel'; listingId: string }
  | { kind: 'browse'; material?: MaterialType; page: number }

function parse(customId: string): Parsed | null {
  if (customId.startsWith(MARKET_BUY_BUTTON_PREFIX)) {
    const listingId = customId.slice(MARKET_BUY_BUTTON_PREFIX.length)
    return listingId ? { kind: 'buy', listingId } : null
  }
  if (customId.startsWith(MARKET_CANCEL_BUTTON_PREFIX)) {
    const listingId = customId.slice(MARKET_CANCEL_BUTTON_PREFIX.length)
    return listingId ? { kind: 'cancel', listingId } : null
  }
  if (customId.startsWith(MARKET_BROWSE_BUTTON_PREFIX)) {
    const rest = customId.slice(MARKET_BROWSE_BUTTON_PREFIX.length)
    // `<material|_>:<page>:<dir>` (dir: 'p' or 'n')
    const parts = rest.split(':')
    if (parts.length !== 3) return null
    const [matToken, pageStr, dir] = parts
    if (dir !== 'p' && dir !== 'n') return null
    const page = Number.parseInt(pageStr ?? '', 10)
    if (!Number.isFinite(page) || page < 1) return null
    const material = matToken === '_' ? undefined : (matToken as MaterialType)
    return { kind: 'browse', material, page }
  }
  return null
}

export class MarketButtonHandler extends InteractionHandler {
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
    const data = parse(interaction.customId)
    if (!data) return this.none()
    return this.some(data)
  }

  public async run(
    interaction: ButtonInteraction,
    data: Parsed
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    if (data.kind === 'browse') {
      const result = await MarketService.browse(db, {
        material: data.material,
        page: data.page,
        pageSize: BROWSE_PAGE_SIZE
      })
      const container = buildBrowseContainer({
        result,
        material: data.material,
        viewerId: interaction.user.id,
        t
      })
      await interaction.update({
        components: [container],
        flags: v2Flags(false)
      } as Parameters<typeof interaction.update>[0])
      return
    }

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      if (data.kind === 'buy') {
        const result = await MarketService.buy(db, {
          buyerId: interaction.user.id,
          listingId: data.listingId,
          guildId: interaction.guildId,
          actor: resolveMarketActor(interaction)
        })
        logMarketBuySignal(
          this.container.logger,
          {
            buyerId: interaction.user.id,
            sellerId: result.listing.sellerId,
            listingId: result.listing.id,
            guildId: interaction.guildId
          },
          result.actorSignal
        )
        await interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.success,
            title: t('game:market.buy.success', {
              material: localizeMaterial(
                t,
                result.listing.material as MaterialType
              ),
              quantity: formatBigInt(BigInt(result.listing.qty))
            }),
            footer: t('game:market.buy.footer', {
              gross: formatBigInt(result.grossPrice),
              tax: formatBigInt(result.tax),
              net: formatBigInt(result.netRevenue)
            }),
            ephemeral: true
          })
        )
        return
      }
      // cancel
      const result = await MarketService.cancel(db, {
        userId: interaction.user.id,
        listingId: data.listingId,
        guildId: interaction.guildId
      })
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:market.cancel.success', {
            material: localizeMaterial(t, result.returned.material),
            quantity: formatBigInt(result.returned.quantity)
          }),
          ephemeral: true
        })
      )
    } catch (err) {
      const surface = data.kind === 'buy' ? 'buy' : 'cancel'
      const message = resolveMarketErrorMessage(err, surface, t)
      if (!isKnownServiceError(err)) {
        this.container.logger.error(err)
      }
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: message,
          ephemeral: true
        })
      )
    }
  }
}

function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}
