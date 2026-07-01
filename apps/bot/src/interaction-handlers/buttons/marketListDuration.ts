/**
 * `/market list` 기간 선택 버튼 핸들러.
 *
 * customId 포맷: `market:list:dur:<ownerId>:<material>:<days>:<avgPriceStr>`
 *
 * 동작:
 * - 프리셋(3/7/14/30일): deferUpdate → 수량 Select UI 표시
 * - custom: showModal() — 수량·가격·기간을 모두 직접 입력하는 기존 Modal 표시
 *
 * Note: `MARKET_LIST_MODAL_PREFIX` 는 modals/marketListDetails.ts 와 공유한다.
 * Note: `MARKET_LIST_QTY_SELECT_PREFIX` 는 selects/marketListQuantity.ts 와 공유한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ContainerBuilder,
  ModalBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction
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

/** 기간 선택 버튼 customId prefix — marketListMaterial.ts 와 공유. */
export const MARKET_LIST_DUR_BUTTON_PREFIX = 'market:list:dur:'

/** Modal customId prefix — modals/marketListDetails.ts 와 공유. */
export const MARKET_LIST_MODAL_PREFIX = 'market:list:details:'

/** 수량 Select Menu customId prefix — selects/marketListQuantity.ts 와 공유. */
export const MARKET_LIST_QTY_SELECT_PREFIX = 'market:list:qty:'

/** 프리셋 수량 목록 */
export const PRESET_QUANTITIES = [10, 50, 100, 500, 1000] as const

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30', 'custom'])

/**
 * 수량·가격을 직접 입력하는 Modal 빌더 (수량 + 가격 필드, 기간은 customId에 인코딩).
 *
 * selects/marketListQuantity.ts 의 "직접 입력" 경로에서도 재사용된다.
 */
export function buildDetailsModal(
  material: MaterialType,
  days: string,
  avgPrice: string | undefined,
  t: TFunction
): ModalBuilder {
  const isCustomDays = days === 'custom'
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

  const modal = new ModalBuilder()
    .setCustomId(`${MARKET_LIST_MODAL_PREFIX}${material}:${days}`)
    .setTitle(
      t('game:market.list.modal.title', {
        material: localizeMaterial(t, material)
      })
    )

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('quantity')
        .setLabel(t('game:market.list.modal.quantityLabel'))
        .setStyle(TextInputStyle.Short)
        .setPlaceholder(t('game:market.list.modal.quantityPlaceholder'))
        .setMinLength(1)
        .setMaxLength(20)
        .setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
  )

  if (isCustomDays) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('duration')
          .setLabel(t('game:market.list.modal.durationLabel'))
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(2)
          .setRequired(true)
          .setValue('7')
      )
    )
  }

  return modal
}

/**
 * 수량 Select Menu 컨테이너.
 *
 * 프리셋 수량 선택 + "직접 입력" 옵션(→ 기존 Modal 플로우).
 */
export function buildQuantitySelectContainer(
  ownerId: string,
  material: MaterialType,
  days: string,
  avgPrice: bigint | null,
  t: TFunction
): ContainerBuilder {
  const taxPct = (taxRateForDuration(Number.parseInt(days, 10)) * 100).toFixed(
    0
  )
  const avgPriceStr = avgPrice?.toString() ?? '0'

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.list.qtySelect.title', { material: localizeMaterial(t, material) })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      [
        t('game:market.list.qtySelect.summary', {
          material: localizeMaterial(t, material),
          days,
          tax: taxPct
        }),
        avgPrice !== null
          ? t('game:market.list.qtySelect.priceInfo', {
              price: formatBigInt(avgPrice)
            })
          : t('game:market.list.qtySelect.noPrice')
      ].join('\n')
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const selectCustomId = `${MARKET_LIST_QTY_SELECT_PREFIX}${ownerId}:${material}:${days}:${avgPriceStr}`
  const options = PRESET_QUANTITIES.map((q) =>
    new StringSelectMenuOptionBuilder().setLabel(`${q}개`).setValue(String(q))
  )
  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('game:market.list.qtySelect.customOption'))
      .setDescription(t('game:market.list.qtySelect.customOptionDesc'))
      .setValue('custom')
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId)
    .setPlaceholder(t('game:market.list.qtySelect.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options)

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

export class MarketListDurationButtonHandler extends InteractionHandler {
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
      MARKET_LIST_DUR_BUTTON_PREFIX
    )
    if (!parsed) return this.none()

    // rest = <material>:<days>:<avgPriceStr>
    const firstColon = parsed.rest.indexOf(':')
    if (firstColon === -1) return this.none()
    const material = parsed.rest.slice(0, firstColon)
    const remainder = parsed.rest.slice(firstColon + 1)

    const secondColon = remainder.indexOf(':')
    if (secondColon === -1) return this.none()
    const days = remainder.slice(0, secondColon)
    const avgPriceStr = remainder.slice(secondColon + 1)

    if (!VALID_MATERIALS.has(material)) return this.none()
    if (!VALID_DAYS.has(days)) return this.none()

    return this.some({
      ownerId: parsed.ownerId,
      material: material as MaterialType,
      days,
      avgPriceStr
    })
  }

  public async run(
    interaction: ButtonInteraction,
    data: {
      ownerId: string
      material: MaterialType
      days: string
      avgPriceStr: string
    }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    if (data.days === 'custom') {
      // 직접 입력: 수량·가격·기간 모두 Modal로 입력
      const avgPrice = data.avgPriceStr !== '0' ? data.avgPriceStr : undefined
      await interaction.showModal(
        buildDetailsModal(data.material, 'custom', avgPrice, t)
      )
      return
    }

    // 프리셋 기간: 수량 Select UI 표시
    const avgPrice = data.avgPriceStr !== '0' ? BigInt(data.avgPriceStr) : null
    await interaction.deferUpdate()
    const container = buildQuantitySelectContainer(
      data.ownerId,
      data.material,
      data.days,
      avgPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
