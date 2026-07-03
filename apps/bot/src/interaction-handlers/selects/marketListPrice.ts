/**
 * `/market list` 가격 Select Menu 핸들러.
 *
 * customId 포맷: `market:list:prc:<ownerId>:<material>:<days>:<quantity>:<avgPriceStr>`
 *
 * 동작:
 * - 프리셋 가격 선택 시: deferUpdate → 확인 UI (등록/취소 버튼) 표시
 * - "직접 입력" 선택 시: showModal() — 가격 전용 Modal (deferUpdate 없이)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type StringSelectMenuInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { formatBigInt } from '@structures/renderers'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { localizeMaterial } from '../../utils/enumLocale'
import { V2_ACCENT, v2EditPayload } from '../../utils/ComponentsV2'
import { taxRateForDuration } from '../../services/market'
import {
  MARKET_LIST_PRC_SELECT_PREFIX,
  MARKET_LIST_PRC_MODAL_PREFIX
} from '../selects/marketListQuantity'

/** 등록 확인 버튼 customId prefix — buttons/marketListConfirm.ts 와 공유. */
export const MARKET_LIST_OK_PREFIX = 'market:list:ok:'

/** 등록 단계 취소 버튼 customId prefix — buttons/marketListConfirm.ts 와 공유. */
export const MARKET_LIST_STEP_CANCEL_PREFIX = 'market:list:step_cancel:'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30'])

/**
 * 등록 확인 컨테이너 — 자재·수량·가격·기간·세율 요약 + [등록] [취소] 버튼.
 *
 * selects/marketListPrice.ts 와 modals/marketListPriceCustom.ts 에서 재사용.
 */
export function buildConfirmContainer(
  ownerId: string,
  material: MaterialType,
  days: string,
  quantity: string,
  price: string,
  t: TFunction
): ContainerBuilder {
  const taxRate = taxRateForDuration(Number.parseInt(days, 10))
  const taxPct = (taxRate * 100).toFixed(0)

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.success)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.list.confirm.title', { material: localizeMaterial(t, material) })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.list.confirm.detail', {
        material: localizeMaterial(t, material),
        quantity: formatBigInt(BigInt(quantity)),
        price: formatBigInt(BigInt(price)),
        days,
        tax: taxPct
      })
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const okBtn = new ButtonBuilder()
    .setCustomId(
      `${MARKET_LIST_OK_PREFIX}${ownerId}:${material}:${days}:${quantity}:${price}`
    )
    .setStyle(ButtonStyle.Primary)
    .setLabel(t('game:market.list.confirm.okBtn'))

  const cancelBtn = new ButtonBuilder()
    .setCustomId(`${MARKET_LIST_STEP_CANCEL_PREFIX}${ownerId}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:market.list.confirm.cancelBtn'))

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(okBtn, cancelBtn)
  )
  return container
}

export class MarketListPriceSelectHandler extends InteractionHandler {
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
      MARKET_LIST_PRC_SELECT_PREFIX
    )
    if (!parsed) return this.none()

    // rest = <material>:<days>:<quantity>:<avgPriceStr>
    const parts = parsed.rest.split(':')
    if (parts.length < 4) return this.none()
    const [material, days, quantity, ...priceParts] = parts
    if (!material || !days || !quantity) return this.none()
    if (!VALID_MATERIALS.has(material)) return this.none()
    if (!VALID_DAYS.has(days)) return this.none()
    if (!/^\d+$/.test(quantity)) return this.none()

    const avgPriceStr = priceParts.join(':') || '0'
    const selectedPrice = interaction.values[0]
    if (!selectedPrice) return this.none()

    return this.some({
      ownerId: parsed.ownerId,
      material: material as MaterialType,
      days,
      quantity,
      avgPriceStr,
      selectedPrice
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: {
      ownerId: string
      material: MaterialType
      days: string
      quantity: string
      avgPriceStr: string
      selectedPrice: string
    }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    if (data.selectedPrice === 'custom') {
      // 가격 직접 입력 Modal — deferUpdate 없이 바로 showModal
      const avgPrice = data.avgPriceStr !== '0' ? data.avgPriceStr : undefined
      const modal = buildPriceInputModal(
        data.material,
        data.days,
        data.quantity,
        avgPrice,
        t
      )
      await interaction.showModal(modal)
      return
    }

    if (!/^\d+$/.test(data.selectedPrice)) return

    await interaction.deferUpdate()
    const container = buildConfirmContainer(
      data.ownerId,
      data.material,
      data.days,
      data.quantity,
      data.selectedPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}

/**
 * 가격 전용 Modal 빌더.
 *
 * avgPrice 가 있으면 가격 필드에 pre-fill.
 * customId: `market:list:prc_m:<material>:<days>:<quantity>`
 */
function buildPriceInputModal(
  material: MaterialType,
  days: string,
  quantity: string,
  avgPrice: string | undefined,
  t: TFunction
): ModalBuilder {
  const priceInput = new TextInputBuilder()
    .setCustomId('price_per_unit')
    .setLabel(t('game:market.list.modal.priceLabel'))
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(20)
    .setRequired(true)

  if (avgPrice) {
    priceInput.setValue(avgPrice)
  } else {
    priceInput.setPlaceholder(t('game:market.list.modal.pricePlaceholder'))
  }

  return new ModalBuilder()
    .setCustomId(
      `${MARKET_LIST_PRC_MODAL_PREFIX}${material}:${days}:${quantity}`
    )
    .setTitle(
      t('game:market.list.modal.priceOnlyTitle', {
        material: localizeMaterial(t, material)
      })
    )
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )
}
