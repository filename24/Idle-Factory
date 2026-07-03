/**
 * `/market` 커맨드 그룹.
 *
 * 서브커맨드:
 *  - `list` — 자재 Select Menu → Modal UI 를 통해 마켓에 자재 등록.
 *  - `buy <listing_id>` — 매물 구매 (listing_id 자동완성 지원).
 *  - `cancel <listing_id>` — 본인 매물 취소 (listing_id 자동완성 지원).
 *  - `browse [material] [page]` — 활성 매물 목록 페이지네이션.
 *  - `sell` — 창고 자재를 글로벌 마켓에 즉시 판매 (현재 시세 100%, #15 U-3).
 *  - `price` — 글로벌 마켓 자재 시세 보드 (현재가·기준가 대비 등락).
 *
 * 등록·글로벌 판매 즉시 `MARKET_LISTED` 이벤트가 발화돼 Q3 ("자재 판매")
 * 트리거를 살린다 — 글로벌 판매 덕에 1인 서버에서도 Q3 완주가 가능하다.
 *
 * 응답은 모두 Components v2 — list/buy/cancel 성공 응답과 browse 카드에는
 * 추가 액션 버튼을 부착하며, 텍스트와 버튼 사이에 `SeparatorBuilder` 를 둔다.
 *
 * 참조: docs/design/06-market.md, docs/design/00-onboarding.md §튜토리얼 퀘스트 #3
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  type AutocompleteInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import {
  buildPriceBoardContainer,
  buildSellMaterialSelectContainer,
  formatBigInt
} from '@structures/renderers'
import { resolveMarketErrorMessage } from '@utils/marketErrorKey'
import {
  localizeMaterial,
  materialChoiceLocalizations
} from '../../utils/enumLocale'
import { MarketService } from '../../services/market'
import { MarketPriceService } from '../../services/marketPrice'
import { MarketSellService } from '../../services/marketSell'
import type {
  ActorTrustSignal,
  MarketActorInput
} from '../../services/tradeLog'
import { UserService } from '../../services/user'

export const MATERIAL_CHOICES: readonly MaterialType[] = [
  'GRAIN',
  'ORE',
  'WOOD',
  'CRUDE_OIL',
  'STEEL',
  'FUEL',
  'PLASTIC',
  'PROCESSED_FOOD',
  'FURNITURE',
  'CAR',
  'ELECTRONIC',
  'FINISHED_FOOD'
]

/** browse 페이지당 매물 수 — Components v2 컨테이너 가독성 기준. */
const BROWSE_PAGE_SIZE = 5
/** Discord autocomplete 응답 라벨 길이 한도. */
const AUTOCOMPLETE_NAME_MAX = 100

/** customId prefix 들 — 인터랙션 핸들러와 공유. */
export const MARKET_BUY_BUTTON_PREFIX = 'market:buy:'
export const MARKET_CANCEL_BUTTON_PREFIX = 'market:cancel:'
export const MARKET_BROWSE_BUTTON_PREFIX = 'market:browse:'
/** `/market list` 자재 Select Menu customId prefix. Select 핸들러와 공유. */
export const MARKET_LIST_MATERIAL_SELECT_PREFIX = 'market:list:mat:'

export class MarketCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    if (sub === 'list') return this.handleList(interaction)
    if (sub === 'buy') return this.handleBuy(interaction)
    if (sub === 'cancel') return this.handleCancel(interaction)
    if (sub === 'browse') return this.handleBrowse(interaction)
    if (sub === 'sell') return this.handleSell(interaction)
    if (sub === 'price') return this.handlePrice(interaction)
    return this.replyUnknown(interaction)
  }

  /**
   * `listing_id` 옵션을 가진 서브커맨드(buy/cancel) 자동완성.
   *
   * ACTIVE & 미만료 매물에서 query prefix 매칭.
   */
  public override async autocompleteRun(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused(true)
    if (focused.name !== 'listing_id') {
      return interaction.respond([])
    }
    const t = await fetchT(interaction)
    const choices = await MarketService.searchActiveForAutocomplete(
      this.container.db,
      { query: String(focused.value), limit: 25 }
    )
    return interaction.respond(
      choices.map((c) => ({
        name: truncate(
          `${localizeMaterial(t, c.material)} ×${c.qty} @${formatBigInt(c.price)} #${c.id.slice(-6)}`,
          AUTOCOMPLETE_NAME_MAX
        ),
        value: c.id
      }))
    )
  }

  private async handleList(interaction: Command.ChatInputCommandInteraction) {
    const t = await fetchT(interaction)
    const container = buildListMaterialSelectContainer(interaction.user.id, t)
    return interaction.reply({ components: [container], flags: v2Flags(true) })
  }

  private async handleBuy(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const listingId = interaction.options.getString('listing_id', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketService.buy(db, {
        buyerId: interaction.user.id,
        listingId,
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

      return interaction.reply(
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
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'buy')
    }
  }

  private async handleCancel(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const listingId = interaction.options.getString('listing_id', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketService.cancel(db, {
        userId: interaction.user.id,
        listingId,
        guildId: interaction.guildId
      })

      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          title: t('game:market.cancel.success', {
            material: localizeMaterial(t, result.returned.material),
            quantity: formatBigInt(result.returned.quantity)
          }),
          ephemeral: false
        })
      )
    } catch (err) {
      return this.replyFromError(interaction, err, 'cancel')
    }
  }

  /**
   * `/market sell` — 창고 보유 자재의 글로벌 즉시 판매 1단계 (자재 Select).
   *
   * 창고에 판매 가능한 자재(count>0, RAW_BOOSTER 제외)가 없으면 안내만 응답.
   * 이후 단계는 selects/marketSellMaterial → selects/marketSellQuantity →
   * buttons/marketSellConfirm 핸들러 체인이 이어받는다.
   */
  private async handleSell(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, { discordId: interaction.user.id })
    const stacks = await MarketSellService.listSellableStacks(
      db,
      interaction.user.id,
      MATERIAL_CHOICES
    )

    if (stacks.length === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          body: t('game:market.sell.selectMaterial.empty'),
          ephemeral: true
        })
      )
    }

    const container = buildSellMaterialSelectContainer(
      interaction.user.id,
      stacks,
      t
    )
    return interaction.reply({ components: [container], flags: v2Flags(true) })
  }

  /**
   * `/market price` — 글로벌 마켓 시세 보드 (자재 13종, 공개 응답).
   */
  private async handlePrice(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const views = await MarketPriceService.listPrices(db)
    if (views.length === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          body: t('game:market.price.empty'),
          ephemeral: true
        })
      )
    }

    const container = buildPriceBoardContainer(views, t)
    return interaction.reply({ components: [container], flags: v2Flags(false) })
  }

  private async handleBrowse(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)
    const material =
      (interaction.options.getString('material') as MaterialType | null) ??
      undefined
    const page = interaction.options.getInteger('page') ?? 1

    const result = await MarketService.browse(db, {
      material,
      page,
      pageSize: BROWSE_PAGE_SIZE
    })

    const container = buildBrowseContainer({
      result,
      material,
      viewerId: interaction.user.id,
      t
    })
    return interaction.reply({
      components: [container],
      flags: v2Flags(false)
    })
  }

  private async replyFromError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    surface: 'list' | 'buy' | 'cancel'
  ) {
    const t = await fetchT(interaction)
    const message = resolveMarketErrorMessage(err, surface, t)
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
        .setName('market')
        .setDescription('Market actions.')
        .setNameLocalization('ko', '마켓')
        .setDescriptionLocalization('ko', '마켓 관련 명령')
        .addSubcommand((sub) =>
          sub
            .setName('list')
            .setNameLocalization('ko', '등록')
            .setDescription('List a material on the market.')
            .setDescriptionLocalization('ko', '자재를 마켓에 등록합니다.')
        )
        .addSubcommand((sub) =>
          sub
            .setName('buy')
            .setNameLocalization('ko', '구매')
            .setDescription('Buy a listing.')
            .setDescriptionLocalization('ko', '마켓 매물을 구매합니다.')
            .addStringOption((opt) =>
              opt
                .setName('listing_id')
                .setNameLocalization('ko', '매물')
                .setDescription('Listing ID')
                .setDescriptionLocalization('ko', '매물 ID')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('cancel')
            .setNameLocalization('ko', '취소')
            .setDescription('Cancel one of your listings.')
            .setDescriptionLocalization('ko', '본인 매물을 취소합니다.')
            .addStringOption((opt) =>
              opt
                .setName('listing_id')
                .setNameLocalization('ko', '매물')
                .setDescription('Listing ID')
                .setDescriptionLocalization('ko', '매물 ID')
                .setRequired(true)
                .setAutocomplete(true)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('browse')
            .setNameLocalization('ko', '둘러보기')
            .setDescription('Browse active listings.')
            .setDescriptionLocalization('ko', '마켓 매물 목록을 봅니다.')
            .addStringOption((opt) =>
              opt
                .setName('material')
                .setNameLocalization('ko', '자재')
                .setDescription('Filter by material')
                .setDescriptionLocalization('ko', '자재 필터')
                .setRequired(false)
                .addChoices(
                  ...MATERIAL_CHOICES.map((m) => ({
                    name: m,
                    name_localizations: materialChoiceLocalizations(m),
                    value: m
                  }))
                )
            )
            .addIntegerOption((opt) =>
              opt
                .setName('page')
                .setNameLocalization('ko', '페이지')
                .setDescription('Page (1-based)')
                .setDescriptionLocalization('ko', '페이지 (1부터)')
                .setMinValue(1)
                .setRequired(false)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('sell')
            .setNameLocalization('ko', '판매')
            .setDescription('Sell materials to the global market instantly.')
            .setDescriptionLocalization(
              'ko',
              '자재를 글로벌 마켓에 즉시 판매합니다.'
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName('price')
            .setNameLocalization('ko', '시세')
            .setDescription('Show global market prices.')
            .setDescriptionLocalization('ko', '글로벌 마켓 시세를 봅니다.')
        )
    )
  }
}

/** 등록 성공 컨테이너 빌더 파라미터. */
export interface ListingSuccessParams {
  readonly listingId: string
  readonly cancelLabel: string
  readonly title: string
  readonly footer: string
}

/**
 * 등록 성공 컨테이너 — 본문 + Separator + [취소] 버튼.
 *
 * Modal 핸들러(modals/marketListDetails.ts)에서도 재사용.
 */
export function buildListingSuccessContainer(
  p: ListingSuccessParams
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.success)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# **${p.title}**`)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${p.footer}`)
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${MARKET_CANCEL_BUTTON_PREFIX}${p.listingId}`)
    .setStyle(ButtonStyle.Danger)
    .setLabel(p.cancelLabel)
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(cancelBtn)
  )
  return container
}

interface BrowseParams {
  readonly result: Awaited<ReturnType<typeof MarketService.browse>>
  readonly material?: MaterialType
  readonly viewerId: string
  readonly t: TFunction
}

/**
 * browse 결과 컨테이너 — 매물 카드 N개 + 페이지네이션 ‹/› 버튼.
 *
 * 본인 매물은 [취소], 타인 매물은 [구매] 버튼을 표시한다.
 */
function buildBrowseContainer(p: BrowseParams): ContainerBuilder {
  const { result, material, viewerId, t } = p
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.browse.title')}**`
    )
  )

  const filterLine = material
    ? t('game:market.browse.filter', {
        material: localizeMaterial(t, material)
      })
    : t('game:market.browse.filter', {
        material: t('game:market.browse.filterAll')
      })
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${filterLine}`)
  )

  if (result.listings.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:market.browse.empty'))
    )
    return container
  }

  for (const listing of result.listings) {
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:market.browse.card', {
          material: localizeMaterial(t, listing.material as MaterialType),
          quantity: formatBigInt(BigInt(listing.qty)),
          price: formatBigInt(listing.price),
          expiresUnix: Math.floor(listing.expiresAt.getTime() / 1000),
          id: listing.id
        })
      )
    )

    const isOwn = listing.sellerId === viewerId
    const button = new ButtonBuilder()
      .setCustomId(
        isOwn
          ? `${MARKET_CANCEL_BUTTON_PREFIX}${listing.id}`
          : `${MARKET_BUY_BUTTON_PREFIX}${listing.id}`
      )
      .setStyle(isOwn ? ButtonStyle.Danger : ButtonStyle.Success)
      .setLabel(
        isOwn
          ? t('game:market.cancel.buttonLabel')
          : t('game:market.buy.buttonLabel')
      )
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(button)
    )
  }

  // 페이지 네비게이션
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t('game:market.browse.page', {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total
      })}`
    )
  )

  // disabled 일 때도 prev/next customId 가 같아지지 않도록 방향 토큰(`p`/`n`) 부여.
  const prev = new ButtonBuilder()
    .setCustomId(
      `${MARKET_BROWSE_BUTTON_PREFIX}${material ?? '_'}:${Math.max(1, result.page - 1)}:p`
    )
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:market.browse.prev'))
    .setDisabled(result.page <= 1)
  const next = new ButtonBuilder()
    .setCustomId(
      `${MARKET_BROWSE_BUTTON_PREFIX}${material ?? '_'}:${Math.min(result.totalPages, result.page + 1)}:n`
    )
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:market.browse.next'))
    .setDisabled(result.page >= result.totalPages)
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)
  )

  return container
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

/**
 * 인터랙션에서 구매자 신뢰 시그널 입력을 추출한다(서비스 input 배선용).
 *
 * 계정 생성일은 `User.createdAt`(snowflake 파생, 항상 존재), 서버 가입일은
 * `GuildMember.joinedAt`. 멤버 캐시 미스/부분 객체면 joinedAt 을 얻지 못하므로 null.
 * (봇 전용 커스텀 epoch 인 `utils/SnowFlake.ts` 는 계정일 산출에 부적합 — 사용 금지.)
 */
export function resolveMarketActor(interaction: {
  user: { createdAt: Date }
  member: unknown
}): MarketActorInput {
  return {
    accountCreatedAt: interaction.user.createdAt,
    guildJoinedAt: extractGuildJoinedAt(interaction.member)
  }
}

/** `GuildMember.joinedAt`(Date) 만 취하고, API 부분 객체(`joined_at` 문자열)나 null 은 null. */
function extractGuildJoinedAt(member: unknown): Date | null {
  if (
    member &&
    typeof member === 'object' &&
    'joinedAt' in member &&
    member.joinedAt instanceof Date
  ) {
    return member.joinedAt
  }
  return null
}

/** 시그널 로거 최소 인터페이스(Sapphire `ILogger` 호환). */
interface SignalLogger {
  warn(...values: readonly unknown[]): void
}

/**
 * 신규 계정/서버 멤버 시그널이 잡히면 구조화 로깅한다(v0, 비차단).
 *
 * 플래그가 없으면 no-op — 정상 거래는 로그 노이즈를 남기지 않는다.
 * IP 취득 불가 확정에 따른 대체 관측 지점(docs/design/09-level-xp.md §사기 방지).
 */
export function logMarketBuySignal(
  logger: SignalLogger,
  ctx: {
    buyerId: string
    sellerId: string
    listingId: string
    guildId: string | null
  },
  signal: ActorTrustSignal | undefined
): void {
  if (!signal) return
  if (!signal.isNewAccount && !signal.isNewGuildMember) return
  logger.warn('[market:buy] 신규 계정 거래 시그널(v0)', { ...ctx, signal })
}

/**
 * `/market list` 자재 Select Menu 컨테이너.
 *
 * ephemeral 응답으로 표시되며, 선택 후 Select 핸들러가 Modal을 띄운다.
 */
function buildListMaterialSelectContainer(
  ownerId: string,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.list.selectMaterial.title')}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.list.selectMaterial.body')
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MARKET_LIST_MATERIAL_SELECT_PREFIX}${ownerId}:_`)
    .setPlaceholder(t('game:market.list.selectMaterial.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      MATERIAL_CHOICES.map((m) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(localizeMaterial(t, m))
          .setValue(m)
      )
    )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

/** browse 컨테이너 빌더 — 인터랙션 핸들러에서 페이지 갱신 시 재사용. */
export { buildBrowseContainer }
