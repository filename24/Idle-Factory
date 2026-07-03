/**
 * 자재 직구매 UI 렌더러 — `/market directbuy` 플로우 (#16).
 *
 * `/market sell`(MarketRenderer)과 같은 Select 단계형 UI 를 따른다:
 * 자재 Select(허용 T1+T2 9종) → 수량 Select(+직접 입력 Modal) → 확인 버튼 →
 * 체결. 각 단계에 ×2 할증 단가와 남은 일일 한도를 함께 노출한다
 * (docs/design/04-economy.md §자재 직구매).
 *
 * 커맨드·핸들러가 공유하는 customId prefix 도 여기서 정의해 순환 import 를
 * 피한다. Components v2 전용 — `.claude/skills/componentsv2-builder/SKILL.md` 준수.
 *
 * 참조: docs/design/04-economy.md, GitHub #16
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
import { DIRECT_BUY_MATERIALS } from '@idle/game-core'
import { V2_ACCENT } from '@utils/ComponentsV2'
import { localizeMaterial } from '../../utils/enumLocale'
import type { DailyLimitUsage } from '../../services/directBuy'
import { formatBigInt } from './FactoryRenderer'

/** `/market directbuy` 자재 Select customId prefix — selects/marketDirectBuyMaterial.ts 와 공유. */
export const MARKET_DIRECT_BUY_MATERIAL_SELECT_PREFIX = 'market:dbuy:mat:'
/** `/market directbuy` 수량 Select customId prefix — selects/marketDirectBuyQuantity.ts 와 공유. */
export const MARKET_DIRECT_BUY_QTY_SELECT_PREFIX = 'market:dbuy:qty:'
/** `/market directbuy` 수량 직접 입력 Modal customId prefix — modals/marketDirectBuyQuantityCustom.ts 와 공유. */
export const MARKET_DIRECT_BUY_QTY_MODAL_PREFIX = 'market:dbuy:qty_m:'
/** `/market directbuy` 구매 확정 버튼 customId prefix — buttons/marketDirectBuyConfirm.ts 와 공유. */
export const MARKET_DIRECT_BUY_OK_PREFIX = 'market:dbuy:ok:'
/** `/market directbuy` 단계 취소 버튼 customId prefix — buttons/marketDirectBuyConfirm.ts 와 공유. */
export const MARKET_DIRECT_BUY_STEP_CANCEL_PREFIX = 'market:dbuy:step_cancel:'

/**
 * 수량 Select 프리셋 — 남은 한도 미만인 값만 노출하고 "남은 한도 전부" 옵션을
 * 항상 마지막에 추가한다(값 중복 방지 — `/market sell` 프리셋과 동일 규약).
 */
export const DIRECT_BUY_PRESET_QUANTITIES = [1, 10, 100, 1_000] as const

/** 일일 한도 요약 라인(`-# ...`)을 만든다 — 각 단계 컨테이너가 공유. */
function limitSummaryLine(usage: DailyLimitUsage, t: TFunction): string {
  return `-# ${t('game:market.directbuy.limitSummary', {
    remaining: usage.remaining.toLocaleString('en-US'),
    limit: usage.limit.toLocaleString('en-US'),
    resetUnix: Math.floor(usage.resetsAt.getTime() / 1000)
  })}`
}

/**
 * `/market directbuy` 1단계 — 허용 자재(T1+T2 9종) Select 컨테이너.
 *
 * 옵션 description 에 ×2 할증 단가를 노출한다. `prices` 에 시세가 없는 자재
 * (시드 누락 방어 경로)는 단가 표기를 생략한다.
 *
 * @param ownerId 호출자 snowflake — customId 소유권 검증용
 * @param unitPrices 자재별 **×2 할증 적용된** 직구매 단가
 * @param usage 오늘 일일 한도 사용 현황
 */
export function buildDirectBuyMaterialSelectContainer(
  ownerId: string,
  unitPrices: ReadonlyMap<MaterialType, bigint>,
  usage: DailyLimitUsage,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.directbuy.selectMaterial.title')}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.directbuy.selectMaterial.body')
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(limitSummaryLine(usage, t))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MARKET_DIRECT_BUY_MATERIAL_SELECT_PREFIX}${ownerId}:_`)
    .setPlaceholder(t('game:market.directbuy.selectMaterial.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      DIRECT_BUY_MATERIALS.map((material) => {
        const option = new StringSelectMenuOptionBuilder()
          .setLabel(localizeMaterial(t, material))
          .setValue(material)
        const unitPrice = unitPrices.get(material)
        if (unitPrice !== undefined) {
          option.setDescription(
            t('game:market.directbuy.selectMaterial.priceDesc', {
              price: formatBigInt(unitPrice)
            })
          )
        }
        return option
      })
    )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

/**
 * `/market directbuy` 2단계 — 수량 Select 컨테이너.
 *
 * 프리셋(남은 한도 미만) + 남은 한도 전량 + 직접 입력 옵션. 본문에 ×2 할증
 * 단가와 남은 일일 한도를 노출한다. 시세는 30분 tick 으로 변동될 수 있으므로
 * 표시용 참고값이며, 최종 정산은 체결 시점 가격 ×2 로 계산된다(확인 단계 고지).
 *
 * @param unitPrice ×2 할증 적용된 직구매 단가
 */
export function buildDirectBuyQuantityContainer(
  ownerId: string,
  material: MaterialType,
  unitPrice: bigint,
  usage: DailyLimitUsage,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.directbuy.qtySelect.title', {
        material: localizeMaterial(t, material)
      })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.directbuy.qtySelect.summary', {
        price: formatBigInt(unitPrice)
      })
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(limitSummaryLine(usage, t))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const options: StringSelectMenuOptionBuilder[] = []
  for (const preset of DIRECT_BUY_PRESET_QUANTITIES) {
    if (preset >= usage.remaining) continue
    options.push(
      new StringSelectMenuOptionBuilder()
        .setLabel(
          t('game:market.directbuy.qtySelect.presetOption', {
            count: preset.toLocaleString('en-US')
          })
        )
        .setValue(preset.toString())
    )
  }
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(
        t('game:market.directbuy.qtySelect.maxOption', {
          count: usage.remaining.toLocaleString('en-US')
        })
      )
      .setValue(usage.remaining.toString())
  )
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('game:market.directbuy.qtySelect.customOption'))
      .setDescription(t('game:market.directbuy.qtySelect.customOptionDesc'))
      .setValue('custom')
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${MARKET_DIRECT_BUY_QTY_SELECT_PREFIX}${ownerId}:${material}`)
    .setPlaceholder(t('game:market.directbuy.qtySelect.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options)
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

/**
 * `/market directbuy` 수량 직접 입력 Modal 빌더.
 *
 * customId: `market:dbuy:qty_m:<material>` — Modal 제출자는 항상 본인이므로
 * ownerId 를 인코딩하지 않는다 (sell 플로우의 Modal 과 동일 규약).
 */
export function buildDirectBuyQuantityModal(
  material: MaterialType,
  t: TFunction
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`${MARKET_DIRECT_BUY_QTY_MODAL_PREFIX}${material}`)
    .setTitle(
      t('game:market.directbuy.modal.title', {
        material: localizeMaterial(t, material)
      })
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('quantity')
          .setLabel(t('game:market.directbuy.modal.quantityLabel'))
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(t('game:market.directbuy.modal.quantityPlaceholder'))
          .setMinLength(1)
          .setMaxLength(6)
          .setRequired(true)
      )
    )
}

/**
 * `/market directbuy` 3단계 — 구매 확인 컨테이너.
 *
 * 수량 × 표시 시점 ×2 단가 = 예상 지불액 요약 + 구매 후 남은 한도 +
 * [구매] [취소] 버튼. 시세가 30분 tick 으로 변동될 수 있음을 푸터로
 * 고지한다 — 실제 정산은 체결 트랜잭션 시점의 `currentPrice × 2` 를 쓴다.
 *
 * @param unitPrice ×2 할증 적용된 직구매 단가 (표시 시점)
 */
export function buildDirectBuyConfirmContainer(
  ownerId: string,
  material: MaterialType,
  quantity: bigint,
  unitPrice: bigint,
  usage: DailyLimitUsage,
  t: TFunction
): ContainerBuilder {
  const total = unitPrice * quantity
  const remainingAfter = usage.remaining - Number(quantity)

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.warn)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.directbuy.confirm.title', {
        material: localizeMaterial(t, material)
      })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.directbuy.confirm.detail', {
        material: localizeMaterial(t, material),
        quantity: formatBigInt(quantity),
        price: formatBigInt(unitPrice),
        total: formatBigInt(total)
      })
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.directbuy.confirm.remainingAfter', {
        remaining: Math.max(0, remainingAfter).toLocaleString('en-US'),
        limit: usage.limit.toLocaleString('en-US')
      })
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# ${t('game:market.directbuy.confirm.notice')}`
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const okBtn = new ButtonBuilder()
    .setCustomId(
      `${MARKET_DIRECT_BUY_OK_PREFIX}${ownerId}:${material}:${quantity}`
    )
    .setStyle(ButtonStyle.Success)
    .setLabel(t('game:market.directbuy.confirm.okBtn'))
  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${MARKET_DIRECT_BUY_STEP_CANCEL_PREFIX}${ownerId}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:market.directbuy.confirm.cancelBtn'))
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(okBtn, cancelBtn)
  )
  return container
}
