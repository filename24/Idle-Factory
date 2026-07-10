/**
 * 주식 UI 렌더러 (#18) — `/stock info` 종목 상세 카드.
 *
 * 현재가·등락·보유 지분·평단가·평가 손익 + 최근 24시간 가격 추이를 블록
 * 문자 ASCII 스파크라인으로 렌더한다. 등락·손익 표시는 마켓 시세 보드와
 * 동일한 추세 이모지(📈/📉/➖) 규약을 공유한다.
 *
 * Components v2 전용 — `.claude/skills/componentsv2-builder/SKILL.md` 준수
 * (ContainerBuilder 루트, IsComponentsV2 플래그, EmbedBuilder/content 금지).
 *
 * 등락률·손익률 계산은 BigInt 1만분율 정수 산술로 하고(Float 곱셈 금지),
 * 백분율 문자열로의 최종 변환만 표시용 Number 산술을 쓴다(마켓 렌더러 관례).
 *
 * 참조: docs/design/08-stock.md §주가 변동·배당 시스템, GitHub #18
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js'
import type { TFunction } from '@sapphire/plugin-i18next'
import { V2_ACCENT } from '@utils/ComponentsV2'
import type { StockDetailView, StockMarketRow } from '../../services/stock'
import { localizeFactoryType } from '../../utils/enumLocale'
import { formatBigInt } from './FactoryRenderer'
import { formatChangeFromBasePpm } from './MarketRenderer'

/** `/stock market` 시세 보드의 종목별 매수 버튼 customId 프리픽스 (+종목 id). */
export const STOCK_BUY_BUTTON_PREFIX = 'stock:buymkt:'

/** 시세 보드 매수 수량 입력 Modal customId 프리픽스 (+종목 id). */
export const STOCK_BUY_QTY_MODAL_PREFIX = 'stock:buyqty:'

/**
 * 시세 보드 페이지 이동/새로고침 버튼 customId 프리픽스.
 *
 * owner-prefixed 포맷 — `stock:mkt:<ownerId>:<targetPage>`. 공개 메시지라
 * 네비게이션은 호출자 본인만 하도록 `parseOwnerPrefixedCustomId` 로 게이팅한다
 * (매수 버튼은 누구나 가능하므로 별도 프리픽스). 새로고침은 현재 페이지를
 * 그대로 타깃(`targetPage = 현재 page`)으로 재조회한다.
 */
export const STOCK_MARKET_NAV_PREFIX = 'stock:mkt:'

/**
 * 스파크라인 블록 문자 8단계 (▁ 최저 → █ 최고).
 * 값 범위를 8구간으로 정규화해 각 tick 을 한 글자로 표현한다.
 */
const SPARK_BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

/** 1만분율 스케일 (100% = 10000‱) — 등락률·손익률 정수 산술용. */
const PPM_SCALE = 10_000n

/**
 * 가격 시퀀스를 블록 문자 스파크라인 문자열로 변환한다.
 *
 * 입력은 **오래된 순 → 최신 순** 정렬을 가정한다. 최소~최대 구간을 8단계로
 * 선형 정규화하며(정수 산술), 전 구간이 평평하면(max=min) 중간 블록으로 채운다.
 * 빈 배열이면 빈 문자열을 반환한다(호출부가 대체 문구로 처리).
 *
 * @param prices 시간순(오래된→최신) 가격 목록
 * @returns 블록 문자열 (예: `▁▂▄█▆`)
 */
export function formatStockSparkline(prices: readonly bigint[]): string {
  if (prices.length === 0) return ''
  let min = prices[0]
  let max = prices[0]
  for (const p of prices) {
    if (p < min) min = p
    if (p > max) max = p
  }
  const span = max - min
  if (span === 0n) {
    // 전 구간 동일가 — 중간 블록으로 평탄하게 표시.
    return SPARK_BLOCKS[3].repeat(prices.length)
  }
  const lastIndex = BigInt(SPARK_BLOCKS.length - 1)
  return prices
    .map((p) => {
      // bucket = floor((p - min) * 7 / span) — 0..7 정수 인덱스.
      const bucket = ((p - min) * lastIndex) / span
      return SPARK_BLOCKS[Number(bucket)]
    })
    .join('')
}

/**
 * 두 가격의 등락을 1만분율(‱)로 계산한다 — `(current - ref) × 10000 / ref`.
 *
 * `ref <= 0` 이면 분모가 없으므로 0 을 반환한다(표시용 안전값).
 *
 * @param current 현재가
 * @param ref 기준가 (24시간 전 tick 또는 IPO 가)
 * @returns 등락 1만분율 (양수=상승, 음수=하락)
 */
export function computeChangePpm(current: bigint, ref: bigint): bigint {
  if (ref <= 0n) return 0n
  return ((current - ref) * PPM_SCALE) / ref
}

/**
 * `/stock info` 종목 상세 컨테이너를 만든다.
 *
 * 구성: 제목(공장 종류) → 현재가+등락 → 스파크라인(최근 24 tick) → 보유
 * 지분/평단가/평가 손익(보유 시) → 발행·유통·상장 메타 푸터.
 *
 * 등락 기준가는 최근 tick 윈도의 가장 오래된 tick 가격이며(≈24시간 전),
 * tick 이력이 없으면 IPO 가로 대체한다. 평가 손익은 조회 유저의 보유 행이
 * 있고 평단가가 유효할 때만 노출한다.
 *
 * @param view `StockService.getDetail` 결과 (read-only)
 * @param t i18next 번역 함수
 * @returns Components v2 ContainerBuilder
 */
export function buildStockInfoContainer(
  view: StockDetailView,
  t: TFunction
): ContainerBuilder {
  const { stock, factoryType, holding, totalHeldShares, recentTicks } = view
  const factoryLabel = localizeFactoryType(t, factoryType)

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:stock.info.title', { factory: factoryLabel })}**`
    )
  )

  // 등락 기준가 = 윈도 최고(最古) tick 가격(≈24h 전), 없으면 IPO 가.
  // recentTicks 는 최신순이므로 마지막 원소가 가장 오래됐다.
  const refPrice =
    recentTicks.length > 0
      ? recentTicks[recentTicks.length - 1].price
      : stock.ipoPrice
  const { trend, change } = formatChangeFromBasePpm(
    computeChangePpm(stock.currentPrice, refPrice)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:stock.info.priceLine', {
        price: formatBigInt(stock.currentPrice),
        trend,
        change
      })
    )
  )

  // 스파크라인 — 오래된→최신 순으로 뒤집어 렌더.
  if (recentTicks.length > 0) {
    const oldestFirst = [...recentTicks].reverse().map((tick) => tick.price)
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:stock.info.sparkLine', {
          spark: formatStockSparkline(oldestFirst)
        })
      )
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:stock.info.sparkEmpty'))
    )
  }

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  // 보유 지분·평단가·평가 손익 — 보유 행이 있고 주수>0 일 때만.
  if (holding && holding.shares > 0) {
    const percent =
      stock.sharesOutstanding > 0
        ? ((holding.shares / stock.sharesOutstanding) * 100).toFixed(1)
        : '0.0'
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:stock.info.holdingLine', {
          shares: formatBigInt(BigInt(holding.shares)),
          outstanding: formatBigInt(BigInt(stock.sharesOutstanding)),
          percent: `${percent}%`
        })
      )
    )
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:stock.info.avgLine', {
          avg: formatBigInt(holding.avgBuyPrice)
        })
      )
    )
    // 평가 손익 = (현재가 - 평단가) × 보유 주수. 손익률은 평단가 대비 1만분율.
    if (holding.avgBuyPrice > 0n) {
      const shares = BigInt(holding.shares)
      const pnl = (stock.currentPrice - holding.avgBuyPrice) * shares
      const { trend: pnlTrend, change: pnlChange } = formatChangeFromBasePpm(
        computeChangePpm(stock.currentPrice, holding.avgBuyPrice)
      )
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          t('game:stock.info.pnlLine', {
            pnl: formatBigInt(pnl),
            pnlTrend,
            pnlChange
          })
        )
      )
    }
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:stock.info.noHolding'))
    )
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t('game:stock.info.footer', {
        outstanding: formatBigInt(BigInt(stock.sharesOutstanding)),
        held: formatBigInt(BigInt(totalHeldShares)),
        listedUnix: Math.floor(stock.listedAt.getTime() / 1000)
      })}`
    )
  )

  return container
}

/**
 * `/stock market` 시세 보드 컨테이너를 만든다 — 한 화면에 상장 종목을 모아
 * 보여주고, 각 종목마다 **매수 버튼**(Section accessory)으로 바로 매수한다.
 * 종목이 페이지당 상한을 넘으면 이전/다음 페이지 + 새로고침 네비게이션을 붙인다.
 *
 * 구성: 제목 → (종목 있으면) 부제(전체 수·페이지) → 종목별 Section(종류·현재가·
 * 등락·보유 주수 + 매수 버튼) → 구분선 → 네비 ActionRow(◀ 이전 · 🔄 새로고침 ·
 * 다음 ▶). 종목이 없으면 빈 상태 문구만. 등락 기준가는 IPO 상장가(vs 상장가)다.
 *
 * Section + Button accessory 는 componentsv2-builder 스킬이 권장하는 "목록 +
 * 개별 액션" 패턴. 매수 버튼 customId 는 `STOCK_BUY_BUTTON_PREFIX + 종목 id`
 * (게이팅 없음 — 누구나 매수). 네비 버튼은 owner-prefixed
 * (`STOCK_MARKET_NAV_PREFIX + ownerId + ':' + 대상 페이지`) 라 호출자만 이동한다.
 *
 * @param rows 이 페이지의 종목 행 (read-only)
 * @param t i18next 번역 함수
 * @param opts.ownerId 보드 호출자 id (네비 게이팅용)
 * @param opts.page 현재 페이지(0-base)
 * @param opts.pageCount 전체 페이지 수(>=1)
 * @param opts.total 전체 종목 수
 * @returns Components v2 ContainerBuilder
 */
export function buildStockMarketContainer(
  rows: readonly StockMarketRow[],
  t: TFunction,
  opts: {
    readonly ownerId: string
    readonly page: number
    readonly pageCount: number
    readonly total: number
  }
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# **${t('game:stock.market.title')}**`)
  )

  if (rows.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:stock.market.empty'))
    )
    return container
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t('game:stock.market.pageInfo', {
        count: opts.total,
        page: opts.page + 1,
        pages: opts.pageCount
      })}`
    )
  )

  for (const row of rows) {
    const factoryLabel = localizeFactoryType(t, row.factoryType)
    const { trend, change } = formatChangeFromBasePpm(
      computeChangePpm(row.currentPrice, row.ipoPrice)
    )
    const text = t('game:stock.market.row', {
      factory: factoryLabel,
      price: formatBigInt(row.currentPrice),
      trend,
      change,
      holding: formatBigInt(BigInt(row.myShares))
    })
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`${STOCK_BUY_BUTTON_PREFIX}${row.id}`)
            .setLabel(t('game:stock.market.buyButton'))
            .setStyle(ButtonStyle.Success)
        )
    )
  }

  // 텍스트/Section 다음 ActionRow 앞에는 Separator 필수 (봇 규약).
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const nav = `${STOCK_MARKET_NAV_PREFIX}${opts.ownerId}:`
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${nav}${opts.page - 1}`)
        .setLabel(t('game:stock.market.nav.prev'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(opts.page <= 0),
      new ButtonBuilder()
        .setCustomId(`${nav}${opts.page}`)
        .setLabel(t('game:stock.market.nav.refresh'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${nav}${opts.page + 1}`)
        .setLabel(t('game:stock.market.nav.next'))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(opts.page >= opts.pageCount - 1)
    )
  )

  return container
}

/**
 * 시세 보드 매수 버튼 → 수량 입력 Modal 을 만든다.
 *
 * customId 는 `STOCK_BUY_QTY_MODAL_PREFIX + 종목 id`. 발행 주수 상한이 6자리
 * 안이므로 TextInput 은 1~6자리 정수만 받는다(제출 핸들러가 재검증).
 *
 * @param stockId 대상 종목 id
 * @param factoryLabel 종목(공장 종류) 로케일 라벨 — Modal 제목용
 * @param t i18next 번역 함수
 * @returns discord.js ModalBuilder
 */
export function buildStockBuyModal(
  stockId: string,
  factoryLabel: string,
  t: TFunction
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${STOCK_BUY_QTY_MODAL_PREFIX}${stockId}`)
    .setTitle(t('game:stock.market.modal.title', { factory: factoryLabel }))
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('shares')
          .setLabel(t('game:stock.market.modal.sharesLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:stock.market.modal.sharesPlaceholder'))
          .setMinLength(1)
          .setMaxLength(6)
          .setRequired(true)
      )
    )
}
