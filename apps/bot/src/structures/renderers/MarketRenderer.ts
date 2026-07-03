/**
 * 글로벌 마켓 UI 렌더러 — `/market sell` 판매 플로우와 `/market price` 시세 보드.
 *
 * `/market sell` 은 유저 상점 등록(list) 플로우와 같은 Select 단계형 UI 를
 * 따른다: 자재 Select(창고 보유분만) → 수량 Select(+직접 입력 Modal) →
 * 확인 버튼 → 체결. 커맨드·핸들러가 공유하는 customId prefix 도 여기서
 * 정의해 순환 import 를 피한다.
 *
 * Components v2 전용 — `.claude/skills/componentsv2-builder/SKILL.md` 준수.
 *
 * 참조: docs/design/06-market.md, GitHub #15
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js'
import type { TFunction } from '@sapphire/plugin-i18next'
import type { MaterialType } from '@idle/game-core'
import { V2_ACCENT } from '@utils/ComponentsV2'
import { localizeMaterial } from '../../utils/enumLocale'
import type { MaterialPriceView } from '../../services/marketPrice'
import type { SellableStack } from '../../services/marketSell'
import { formatBigInt } from './FactoryRenderer'

/** `/market sell` 자재 Select customId prefix — selects/marketSellMaterial.ts 와 공유. */
export const MARKET_SELL_MATERIAL_SELECT_PREFIX = 'market:sell:mat:'
/** `/market sell` 수량 Select customId prefix — selects/marketSellQuantity.ts 와 공유. */
export const MARKET_SELL_QTY_SELECT_PREFIX = 'market:sell:qty:'
/** `/market sell` 수량 직접 입력 Modal customId prefix — modals/marketSellQuantityCustom.ts 와 공유. */
export const MARKET_SELL_QTY_MODAL_PREFIX = 'market:sell:qty_m:'
/** `/market sell` 판매 확정 버튼 customId prefix — buttons/marketSellConfirm.ts 와 공유. */
export const MARKET_SELL_OK_PREFIX = 'market:sell:ok:'
/** `/market sell` 단계 취소 버튼 customId prefix — buttons/marketSellConfirm.ts 와 공유. */
export const MARKET_SELL_STEP_CANCEL_PREFIX = 'market:sell:step_cancel:'

/**
 * 수량 Select 프리셋. 보유량 미만인 값만 노출하고, 보유 전량 옵션을 항상
 * 마지막에 추가한다(값 중복 방지 — Discord 는 중복 option value 를 거부).
 */
export const SELL_PRESET_QUANTITIES = [1n, 10n, 100n, 1_000n] as const

/**
 * `/market price` 시세 보드의 티어 그룹 순서.
 * 자재 분류 근거: docs/design/03-factories.md (T1 원자재 → T2 가공재 → T3 완제품 → 특수).
 */
const PRICE_BOARD_TIERS: ReadonlyArray<{
  readonly labelKey: string
  readonly materials: readonly MaterialType[]
}> = [
  {
    labelKey: 'game:market.price.tierT1',
    materials: ['GRAIN', 'ORE', 'WOOD', 'CRUDE_OIL']
  },
  {
    labelKey: 'game:market.price.tierT2',
    materials: ['STEEL', 'FUEL', 'PLASTIC', 'PROCESSED_FOOD', 'FURNITURE']
  },
  {
    labelKey: 'game:market.price.tierT3',
    materials: ['CAR', 'ELECTRONIC', 'FINISHED_FOOD']
  },
  {
    labelKey: 'game:market.price.tierSpecial',
    materials: ['RAW_BOOSTER']
  }
]

/** 등락 추세 이모지 — 상승/하락/보합. */
const TREND_UP = '📈'
const TREND_DOWN = '📉'
const TREND_FLAT = '➖'

/**
 * 기준가 대비 등락(1만분율)을 추세 이모지 + 부호 있는 % 문자열로 변환한다.
 *
 * 예: `1234n → { trend: '📈', change: '+12.3%' }`, `0n → { trend: '➖', change: '0.0%' }`.
 * 표시용 변환이므로 Number 산술 사용 (등락률 범위는 -30%~+100% — 안전).
 */
export function formatChangeFromBasePpm(ppm: bigint): {
  trend: string
  change: string
} {
  const percent = Number(ppm) / 100
  const trend = ppm > 0n ? TREND_UP : ppm < 0n ? TREND_DOWN : TREND_FLAT
  const sign = ppm > 0n ? '+' : ''
  return { trend, change: `${sign}${percent.toFixed(1)}%` }
}

/**
 * `/market sell` 1단계 — 창고 보유 자재 Select 컨테이너.
 *
 * 옵션 description 에 보유 수량을 노출한다. 보유분이 없을 때는 커맨드가
 * 이 빌더 대신 안내 메시지를 응답하므로 stacks 는 비어 있지 않다고 가정.
 */
export function buildSellMaterialSelectContainer(
  ownerId: string,
  stacks: readonly SellableStack[],
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.sell.selectMaterial.title')}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.sell.selectMaterial.body')
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MARKET_SELL_MATERIAL_SELECT_PREFIX}${ownerId}:_`)
    .setPlaceholder(t('game:market.sell.selectMaterial.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      stacks.map((s) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(localizeMaterial(t, s.material))
          .setDescription(
            t('game:market.sell.selectMaterial.holding', {
              count: formatBigInt(s.count)
            })
          )
          .setValue(s.material)
      )
    )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

/**
 * `/market sell` 2단계 — 수량 Select 컨테이너.
 *
 * 프리셋(보유량 미만) + 전량 + 직접 입력 옵션. 본문에 현재 시세를 노출한다.
 * 시세는 30분 tick 으로 변동될 수 있으므로 표시용 참고값이며, 최종 정산은
 * 체결 시점 가격으로 계산된다(확인 단계에서 고지).
 */
export function buildSellQuantityContainer(
  ownerId: string,
  material: MaterialType,
  holding: bigint,
  unitPrice: bigint,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.sell.qtySelect.title', {
        material: localizeMaterial(t, material)
      })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.sell.qtySelect.summary', {
        price: formatBigInt(unitPrice),
        holding: formatBigInt(holding)
      })
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const options: StringSelectMenuOptionBuilder[] = []
  for (const preset of SELL_PRESET_QUANTITIES) {
    if (preset >= holding) continue
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          t('game:market.sell.qtySelect.presetOption', {
            count: formatBigInt(preset)
          })
        )
        .setValue(preset.toString())
    )
  }
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(
        t('game:market.sell.qtySelect.allOption', {
          count: formatBigInt(holding)
        })
      )
      .setValue(holding.toString())
  )
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('game:market.sell.qtySelect.customOption'))
      .setDescription(t('game:market.sell.qtySelect.customOptionDesc'))
      .setValue('custom')
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MARKET_SELL_QTY_SELECT_PREFIX}${ownerId}:${material}`)
    .setPlaceholder(t('game:market.sell.qtySelect.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options)
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

/**
 * `/market sell` 수량 직접 입력 Modal 빌더.
 *
 * customId: `market:sell:qty_m:<material>` — Modal 제출자는 항상 본인이므로
 * ownerId 를 인코딩하지 않는다 (list 플로우의 Modal 과 동일 규약).
 */
export function buildSellQuantityModal(
  material: MaterialType,
  t: TFunction
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${MARKET_SELL_QTY_MODAL_PREFIX}${material}`)
    .setTitle(
      t('game:market.sell.modal.title', {
        material: localizeMaterial(t, material)
      })
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(t('game:market.sell.modal.quantityLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:market.sell.modal.quantityPlaceholder'))
          .setMinLength(1)
          .setMaxLength(20)
          .setRequired(true)
      )
    )
}

/**
 * `/market sell` 3단계 — 판매 확인 컨테이너.
 *
 * 수량 × 표시 시점 단가 = 예상 수령액 요약 + [판매] [취소] 버튼.
 * 시세가 30분 tick 으로 변동될 수 있음을 푸터로 고지한다 — 실제 정산은
 * 체결 트랜잭션 시점의 `currentPrice` 를 사용한다.
 */
export function buildSellConfirmContainer(
  ownerId: string,
  material: MaterialType,
  quantity: bigint,
  unitPrice: bigint,
  t: TFunction
): ContainerBuilder {
  const total = unitPrice * quantity

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.warn)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.sell.confirm.title', {
        material: localizeMaterial(t, material)
      })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.sell.confirm.detail', {
        material: localizeMaterial(t, material),
        quantity: formatBigInt(quantity),
        price: formatBigInt(unitPrice),
        total: formatBigInt(total)
      })
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t('game:market.sell.confirm.notice')}`
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const okBtn = new ButtonBuilder()
    .setCustomId(`${MARKET_SELL_OK_PREFIX}${ownerId}:${material}:${quantity}`)
    .setStyle(ButtonStyle.Success)
    .setLabel(t('game:market.sell.confirm.okBtn'))
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${MARKET_SELL_STEP_CANCEL_PREFIX}${ownerId}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:market.sell.confirm.cancelBtn'))
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(okBtn, cancelBtn)
  )
  return container
}

/**
 * `/market price` 시세 보드 컨테이너.
 *
 * 자재 13종을 티어 그룹(T1→T2→T3→특수)으로 묶어 현재가·기준가 대비 등락(%)
 * 을 표시한다. 페이지네이션 없이 한 컨테이너로 렌더 — 13행은 4000자 한도에
 * 충분히 여유롭다.
 */
export function buildPriceBoardContainer(
  views: readonly MaterialPriceView[],
  t: TFunction
): ContainerBuilder {
  const byMaterial = new Map(views.map((v) => [v.material, v]))

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# **${t('game:market.price.title')}**`)
  )

  let latest: Date | null = null
  for (const tier of PRICE_BOARD_TIERS) {
    const lines: string[] = []
    for (const material of tier.materials) {
      const view = byMaterial.get(material)
      if (!view) continue
      const { trend, change } = formatChangeFromBasePpm(view.changeFromBasePpm)
      lines.push(
        t('game:market.price.line', {
          trend,
          material: localizeMaterial(t, material),
          price: formatBigInt(view.currentPrice),
          base: formatBigInt(view.basePrice),
          change
        })
      )
      if (!latest || view.updatedAt > latest) latest = view.updatedAt
    }
    if (lines.length === 0) continue
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [`## ${t(tier.labelKey)}`, ...lines].join('\n')
      )
    )
  }

  const footerParts = [t('game:market.price.footer')]
  if (latest) {
    footerParts.push(
      t('game:market.price.updated', {
        unix: Math.floor(latest.getTime() / 1000)
      })
    )
  }
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${footerParts.join(' · ')}`)
  )
  return container
}
