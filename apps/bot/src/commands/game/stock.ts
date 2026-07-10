/**
 * `/stock` 커맨드 그룹 (#18) — 서버 주식 상장·매매·조회.
 *
 * 서브커맨드:
 *  - `ipo <factory> <price>` — 본인 공장을 상장(IPO). factory 는 아직 상장하지
 *    않은 본인 공장 자동완성, price 는 유저 희망 IPO 가(기본가의 30~70%로 클램프).
 *  - `buy <stock> <shares>` — 상장 종목 매수 (상대 = 시스템, 무수수료).
 *  - `sell <stock> <shares>` — 상장 종목 매도 (수익 실현 XP +10).
 *  - `info <stock>` — 종목 상세 카드 (현재가·등락·보유 지분·평단·손익 +
 *    최근 24시간 스파크라인).
 *
 * `stock`/`factory` 옵션은 자동완성으로 선택한다. 응답·에러 응답 모두
 * Components v2 (`.claude/skills/componentsv2-builder/SKILL.md` 준수) —
 * `EmbedBuilder`/평문 `content` 금지.
 *
 * 참조: docs/design/08-stock.md, docs/design/09-level-xp.md §해금(Lv.10 매매),
 *      GitHub #18
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { TFunction } from '@sapphire/plugin-i18next'
import type { AutocompleteInteraction, ContainerBuilder } from 'discord.js'
import type { FactoryType } from '@idle/game-core'
import type { PrismaClient } from '@idle/database'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import {
  buildStockInfoContainer,
  buildStockMarketContainer,
  formatBigInt
} from '@structures/renderers'
import {
  resolveStockErrorMessage,
  type StockSurface
} from '@utils/stockErrorKey'
import { localizeFactoryType } from '../../utils/enumLocale'
import { StockService, STOCK_MARKET_PAGE_SIZE } from '../../services/stock'
import { UserService } from '../../services/user'

/** Discord autocomplete 응답 라벨 길이 한도. */
const AUTOCOMPLETE_NAME_MAX = 100

export class StockCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    if (sub === 'market') return this.handleMarket(interaction)
    if (sub === 'ipo') return this.handleIpo(interaction)
    if (sub === 'buy') return this.handleBuy(interaction)
    if (sub === 'sell') return this.handleSell(interaction)
    if (sub === 'info') return this.handleInfo(interaction)
    return this.replyUnknown(interaction)
  }

  /**
   * 자동완성 — `factory`(ipo 대상 미상장 공장) / `stock`(상장 종목).
   */
  public override async autocompleteRun(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true)
    const t = await fetchT(interaction)

    if (focused.name === 'factory') {
      const choices = await searchUnlistedFactories(
        this.container.db as PrismaClient,
        interaction.user.id,
        String(focused.value)
      )
      return interaction.respond(
        choices.map((c) => ({
          name: truncate(
            `${localizeFactoryType(t, c.type)} · Lv.${c.grade} · #${c.id.slice(-6)}`,
            AUTOCOMPLETE_NAME_MAX
          ),
          value: c.id
        }))
      )
    }

    if (focused.name === 'stock') {
      const choices = await StockService.searchListedForAutocomplete(
        this.container.db,
        {
          query: String(focused.value),
          limit: 25,
          guildId: interaction.guildId
        }
      )
      return interaction.respond(
        choices.map((c) => ({
          name: truncate(
            `${localizeFactoryType(t, c.factoryType)} · @${formatBigInt(c.currentPrice)} · #${c.id.slice(-6)}`,
            AUTOCOMPLETE_NAME_MAX
          ),
          value: c.id
        }))
      )
    }

    return interaction.respond([])
  }

  /**
   * `/stock market` — 상장 종목 시세 보드. 한 화면에 종목을 모아 보여주고 각
   * 종목의 매수 버튼(Section accessory)으로 바로 매수 Modal 을 띄운다. 종목이
   * 페이지당 상한(`STOCK_MARKET_PAGE_SIZE`)을 넘으면 이전/다음·새로고침 네비로
   * 페이지를 넘긴다(첫 페이지부터).
   */
  private async handleMarket(interaction: Command.ChatInputCommandInteraction) {
    const t = await fetchT(interaction)
    const payload = await buildStockMarketPayload(this.container.db, {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      page: 0,
      t
    })
    return interaction.reply(payload as Parameters<typeof interaction.reply>[0])
  }

  private async handleIpo(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const factoryId = interaction.options.getString('factory', true)
    const userSetPrice = BigInt(interaction.options.getInteger('price', true))

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await StockService.ipo(db, {
        userId: interaction.user.id,
        factoryId,
        userSetPrice,
        guildId: interaction.guildId
      })
      const factoryLabel = await localizeStockName(
        db as PrismaClient,
        result.stock.id,
        t
      )

      const bodyParts = [
        t('game:stock.ipo.priceInfo', {
          base: formatBigInt(result.defaultIpoPrice),
          requested: formatBigInt(result.requestedPrice),
          final: formatBigInt(result.finalPrice)
        })
      ]
      if (result.clamped) {
        bodyParts.push(
          t('game:stock.ipo.clampedNote', {
            requested: formatBigInt(result.requestedPrice),
            final: formatBigInt(result.finalPrice)
          })
        )
      }

      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:stock.ipo.success', { factory: factoryLabel }),
          body: bodyParts.join('\n'),
          footer: t('game:stock.ipo.footer', {
            shares: formatBigInt(BigInt(result.stock.sharesOutstanding)),
            price: formatBigInt(result.finalPrice)
          }),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'ipo')
    }
  }

  private async handleBuy(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const stockId = interaction.options.getString('stock', true)
    const shares = interaction.options.getInteger('shares', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await StockService.buy(db, {
        userId: interaction.user.id,
        stockId,
        shares,
        guildId: interaction.guildId
      })
      const factoryLabel = await localizeStockName(
        db as PrismaClient,
        stockId,
        t
      )

      return interaction.reply(
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
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'buy')
    }
  }

  private async handleSell(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const stockId = interaction.options.getString('stock', true)
    const shares = interaction.options.getInteger('shares', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await StockService.sell(db, {
        userId: interaction.user.id,
        stockId,
        shares,
        guildId: interaction.guildId
      })
      const factoryLabel = await localizeStockName(
        db as PrismaClient,
        stockId,
        t
      )

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

      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:stock.sell.success', {
            stock: factoryLabel,
            shares: formatBigInt(BigInt(result.shares))
          }),
          body: bodyParts.join('\n'),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'sell')
    }
  }

  private async handleInfo(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const stockId = interaction.options.getString('stock', true)

    try {
      const view = await StockService.getDetail(db, {
        stockId,
        userId: interaction.user.id
      })
      const container = buildStockInfoContainer(view, t)
      return interaction.reply({
        components: [container],
        flags: v2Flags(false)
      })
    } catch (err) {
      return this.replyFromError(interaction, err, 'info')
    }
  }

  private async replyFromError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    surface: StockSurface
  ) {
    const t = await fetchT(interaction)
    const message = resolveStockErrorMessage(err, surface, t)
    if (!isKnownServiceError(err)) {
      this.container.logger.error(err)
    }
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: message,
        ephemeral: true
      })
    )
  }

  private async replyUnknown(interaction: Command.ChatInputCommandInteraction) {
    const t = await fetchT(interaction)
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: t('game:common.error.unknown'),
        ephemeral: true
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('stock')
        .setDescription('Server stock market actions.')
        .setNameLocalization('ko', '주식')
        .setDescriptionLocalization('ko', '서버 주식 관련 명령')
        .addSubcommand((sub) =>
          sub
            .setName('market')
            .setNameLocalization('ko', '시세')
            .setDescription('Browse listed stocks and buy on one screen.')
            .setDescriptionLocalization(
              'ko',
              '상장 종목을 한 화면에서 보고 바로 매수합니다.'
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('ipo')
            .setNameLocalization('ko', '상장')
            .setDescription('List one of your factories as a stock.')
            .setDescriptionLocalization('ko', '본인 공장을 상장합니다.')
            .addStringOption((opt) =>
              opt
                .setName('factory')
                .setNameLocalization('ko', '공장')
                .setDescription('Factory to list')
                .setDescriptionLocalization('ko', '상장할 공장')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('price')
                .setNameLocalization('ko', '희망가')
                .setDescription(
                  'Desired IPO price per share (clamped to 30–70%)'
                )
                .setDescriptionLocalization(
                  'ko',
                  '주당 희망 IPO 가격 (기본가의 30~70%로 조정)'
                )
                .setMinValue(1)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('buy')
            .setNameLocalization('ko', '매수')
            .setDescription('Buy shares of a stock.')
            .setDescriptionLocalization('ko', '종목을 매수합니다.')
            .addStringOption((opt) =>
              opt
                .setName('stock')
                .setNameLocalization('ko', '종목')
                .setDescription('Stock')
                .setDescriptionLocalization('ko', '종목')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('shares')
                .setNameLocalization('ko', '주수')
                .setDescription('Number of shares')
                .setDescriptionLocalization('ko', '매수 주수')
                .setMinValue(1)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('sell')
            .setNameLocalization('ko', '매도')
            .setDescription('Sell shares of a stock.')
            .setDescriptionLocalization('ko', '종목을 매도합니다.')
            .addStringOption((opt) =>
              opt
                .setName('stock')
                .setNameLocalization('ko', '종목')
                .setDescription('Stock')
                .setDescriptionLocalization('ko', '종목')
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('shares')
                .setNameLocalization('ko', '주수')
                .setDescription('Number of shares')
                .setDescriptionLocalization('ko', '매도 주수')
                .setMinValue(1)
                .setRequired(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('info')
            .setNameLocalization('ko', '조회')
            .setDescription('Show stock details.')
            .setDescriptionLocalization('ko', '종목 상세를 조회합니다.')
            .addStringOption((opt) =>
              opt
                .setName('stock')
                .setNameLocalization('ko', '종목')
                .setDescription('Stock')
                .setDescriptionLocalization('ko', '종목')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
    )
  }
}

/**
 * `/stock market` 시세 보드 한 페이지 페이로드를 만든다 (커맨드·네비 핸들러 공용).
 *
 * 요청 페이지를 조회한 뒤, 전체 종목 수로 페이지 수를 구해 요청 페이지가
 * 마지막을 넘으면(종목이 줄어든 경우) 마지막 페이지로 클램프해 재조회한다.
 * 항상 공개(non-ephemeral) Components v2 페이로드를 반환하며, 네비 버튼은
 * 호출자(`userId`) 만 조작하도록 owner-prefixed 로 렌더된다.
 *
 * @param db PrismaClient
 * @param input.userId 보드 호출자 id (보유량 집계·네비 게이팅)
 * @param input.guildId 조회 서버 snowflake (없으면 null)
 * @param input.page 요청 페이지(0-base, 음수는 0 으로 보정)
 * @param input.t i18next 번역 함수
 * @returns `{ components, flags }` Components v2 페이로드
 */
export async function buildStockMarketPayload(
  db: PrismaClient,
  input: {
    readonly userId: string
    readonly guildId: string | null
    readonly page: number
    readonly t: TFunction
  }
): Promise<{ components: ContainerBuilder[]; flags: number }> {
  const size = STOCK_MARKET_PAGE_SIZE
  let page = Math.max(0, input.page)
  const firstPage = await StockService.listListedForGuild(db, {
    guildId: input.guildId,
    userId: input.userId,
    limit: size,
    offset: page * size
  })
  const total = firstPage.total
  let rows = firstPage.rows
  const pageCount = Math.max(1, Math.ceil(total / size))
  // 종목이 줄어 요청 페이지가 마지막을 넘으면 마지막 페이지로 클램프 후 재조회.
  if (page > pageCount - 1) {
    page = pageCount - 1
    const clamped = await StockService.listListedForGuild(db, {
      guildId: input.guildId,
      userId: input.userId,
      limit: size,
      offset: page * size
    })
    rows = clamped.rows
  }
  const container = buildStockMarketContainer(rows, input.t, {
    ownerId: input.userId,
    page,
    pageCount,
    total
  })
  return { components: [container], flags: v2Flags(false) }
}

/** 상장 미완료(미상장) 본인 공장 자동완성 후보. */
interface UnlistedFactoryChoice {
  readonly id: string
  readonly type: FactoryType
  readonly grade: number
}

/**
 * `/stock ipo` 대상 — 아직 상장하지 않은 본인 공장을 자동완성용으로 검색한다.
 *
 * `Stock.factoryId` 가 unique(1:1)이므로 `stock` 역참조가 null 인 공장만 후보다
 * (D1). query 는 종목 id 접미 또는 공장 종류(enum 대문자 prefix)로 메모리 매칭.
 * read-only 조회이며 services/ 를 수정하지 않는다.
 */
async function searchUnlistedFactories(
  db: PrismaClient,
  userId: string,
  query: string
): Promise<UnlistedFactoryChoice[]> {
  const rows = await db.factory.findMany({
    where: { userId, stock: { is: null } },
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { id: true, type: true, grade: true }
  })
  const q = query.trim().toUpperCase()
  const filtered =
    q.length === 0
      ? rows
      : rows.filter(
          (r) => r.type.startsWith(q) || r.id.toUpperCase().includes(q)
        )
  return filtered.map((r) => ({
    id: r.id,
    type: r.type as FactoryType,
    grade: r.grade
  }))
}

/**
 * 종목 id 로 상장 공장 종류의 로케일 라벨을 얻는다 (성공 응답 표시용).
 *
 * 조회 실패 시 id 뒤 6자리로 대체한다. read-only.
 */
async function localizeStockName(
  db: PrismaClient,
  stockId: string,
  t: Parameters<typeof localizeFactoryType>[0]
): Promise<string> {
  const row = await db.stock.findUnique({
    where: { id: stockId },
    select: { factory: { select: { type: true } } }
  })
  return row
    ? localizeFactoryType(t, row.factory.type as FactoryType)
    : `#${stockId.slice(-6)}`
}

function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
