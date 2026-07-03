/**
 * `/market list` 수량 Select Menu 핸들러.
 *
 * customId 포맷: `market:list:qty:<ownerId>:<material>:<days>:<avgPriceStr>`
 *
 * 동작:
 * - 프리셋 수량 선택 시: deferUpdate → 가격 Select UI 표시
 * - "직접 입력" 선택 시: showModal() — 수량·가격 Modal (deferUpdate 없이)
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
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
import {
  buildDetailsModal,
  MARKET_LIST_QTY_SELECT_PREFIX
} from '../buttons/marketListDuration'
import { taxRateForDuration } from '../../services/market'

/** 가격 Select Menu customId prefix — selects/marketListPrice.ts 와 공유. */
export const MARKET_LIST_PRC_SELECT_PREFIX = 'market:list:prc:'

/** 가격 직접 입력 Modal customId prefix — modals/marketListPriceCustom.ts 와 공유. */
export const MARKET_LIST_PRC_MODAL_PREFIX = 'market:list:prc_m:'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30'])

/** 시세 대비 가격 배율 목록 (%) */
const PRICE_PCTS = [75, 90, 100, 110, 125] as const

/**
 * 가격 Select Menu 컨테이너.
 *
 * avgPrice 가 있을 때: 시세 대비 5개 프리셋 + "직접 입력" 옵션
 * avgPrice 가 null 일 때: "직접 입력" 옵션만 표시
 */
export function buildPriceSelectContainer(
  ownerId: string,
  material: MaterialType,
  days: string,
  quantity: string,
  avgPrice: bigint | null,
  t: TFunction
): ContainerBuilder {
  const avgPriceStr = avgPrice?.toString() ?? '0'
  const taxPct = (taxRateForDuration(Number.parseInt(days, 10)) * 100).toFixed(
    0
  )
  const selectCustomId = `${MARKET_LIST_PRC_SELECT_PREFIX}${ownerId}:${material}:${days}:${quantity}:${avgPriceStr}`

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.list.prcSelect.title', {
        material: localizeMaterial(t, material),
        quantity: formatBigInt(BigInt(quantity))
      })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('game:market.list.prcSelect.summary', {
        material: localizeMaterial(t, material),
        days,
        tax: taxPct,
        quantity: formatBigInt(BigInt(quantity))
      })
    )
  )

  if (avgPrice !== null) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:market.list.prcSelect.priceBase', {
          price: formatBigInt(avgPrice)
        })
      )
    )
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:market.list.prcSelect.noPrice')
      )
    )
  }

  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const options: StringSelectMenuOptionBuilder[] = []

  if (avgPrice !== null) {
    for (const pct of PRICE_PCTS) {
      const price = (avgPrice * BigInt(pct)) / 100n
      const safePrice = price < 1n ? 1n : price
      const diffLabel =
        pct === 100 ? '시세' : pct > 100 ? `+${pct - 100}%` : `−${100 - pct}%`
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${diffLabel} — ${formatBigInt(safePrice)}원`)
          .setValue(String(safePrice))
      )
    }
  }

  options.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('game:market.list.prcSelect.customOption'))
      .setDescription(t('game:market.list.prcSelect.customOptionDesc'))
      .setValue('custom')
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId)
    .setPlaceholder(t('game:market.list.prcSelect.placeholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options)

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return container
}

export class MarketListQuantitySelectHandler extends InteractionHandler {
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
      MARKET_LIST_QTY_SELECT_PREFIX
    )
    if (!parsed) return this.none()

    // rest = <material>:<days>:<avgPriceStr>
    const parts = parsed.rest.split(':')
    if (parts.length < 3) return this.none()
    const [material, days, ...priceParts] = parts
    if (!material || !days) return this.none()
    if (!VALID_MATERIALS.has(material)) return this.none()
    if (!VALID_DAYS.has(days)) return this.none()

    const avgPriceStr = priceParts.join(':') || '0'
    const selectedQty = interaction.values[0]
    if (!selectedQty) return this.none()

    return this.some({
      ownerId: parsed.ownerId,
      material: material as MaterialType,
      days,
      avgPriceStr,
      selectedQty
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: {
      ownerId: string
      material: MaterialType
      days: string
      avgPriceStr: string
      selectedQty: string
    }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    if (data.selectedQty === 'custom') {
      // 직접 입력: 수량·가격 Modal — deferUpdate 호출 없이 바로 showModal
      const avgPrice = data.avgPriceStr !== '0' ? data.avgPriceStr : undefined
      await interaction.showModal(
        buildDetailsModal(data.material, data.days, avgPrice, t)
      )
      return
    }

    if (!/^\d+$/.test(data.selectedQty)) return

    const avgPrice = data.avgPriceStr !== '0' ? BigInt(data.avgPriceStr) : null
    await interaction.deferUpdate()
    const container = buildPriceSelectContainer(
      data.ownerId,
      data.material,
      data.days,
      data.selectedQty,
      avgPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
