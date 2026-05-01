/**
 * `/market list` 자재 Select Menu 핸들러.
 *
 * customId 포맷: `market:list:mat:<ownerId>:_`
 *
 * 동작:
 * 1. parseOwnerPrefixedCustomId 로 ownerId 추출
 * 2. assertInteractionOwner 로 본인 확인
 * 3. deferUpdate() — DB 조회 전 응답 타임아웃 방어
 * 4. MarketService.minActivePrice() 로 현재 최저 시세 조회
 * 5. 기간 선택 버튼 UI 로 editReply
 *
 * Note: deferUpdate() + showModal() 공존 불가 —
 * 기간 선택은 별도 버튼 핸들러(marketListDuration)에서 처리한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type StringSelectMenuInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { formatBigInt } from '@structures/renderers'
import {
  MATERIAL_CHOICES,
  MARKET_LIST_MATERIAL_SELECT_PREFIX
} from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import { localizeMaterial } from '../../utils/enumLocale'
import { V2_ACCENT, v2EditPayload } from '../../utils/ComponentsV2'
import { MarketService } from '../../services/market'
import { MARKET_LIST_DUR_BUTTON_PREFIX } from '../buttons/marketListDuration'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

function buildDurationSelectContainer(
  ownerId: string,
  material: MaterialType,
  avgPrice: bigint | null,
  t: Awaited<ReturnType<typeof fetchT>>
): ContainerBuilder {
  const priceText =
    avgPrice !== null
      ? t('game:market.list.durSelect.priceInfo', {
          price: formatBigInt(avgPrice)
        })
      : t('game:market.list.durSelect.noPrice')

  const avgPriceStr = avgPrice?.toString() ?? '0'
  const makeId = (days: string) =>
    `${MARKET_LIST_DUR_BUTTON_PREFIX}${ownerId}:${material}:${days}:${avgPriceStr}`

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:market.list.durSelect.title', { material: localizeMaterial(t, material) })}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${priceText}\n${t('game:market.list.durSelect.taxInfo')}`
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(makeId('3'))
        .setLabel(t('game:market.list.durSelect.btn3d'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(makeId('7'))
        .setLabel(t('game:market.list.durSelect.btn7d'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(makeId('14'))
        .setLabel(t('game:market.list.durSelect.btn14d'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(makeId('30'))
        .setLabel(t('game:market.list.durSelect.btn30d'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(makeId('custom'))
        .setLabel(t('game:market.list.durSelect.btnCustom'))
        .setStyle(ButtonStyle.Primary)
    )
  )
  return container
}

export class MarketListMaterialSelectHandler extends InteractionHandler {
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
      MARKET_LIST_MATERIAL_SELECT_PREFIX
    )
    if (!parsed) return this.none()
    const value = interaction.values[0]
    if (!value || !VALID_MATERIALS.has(value)) return this.none()
    return this.some({
      ownerId: parsed.ownerId,
      material: value as MaterialType
    })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { ownerId: string; material: MaterialType }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const { db } = this.container
    await interaction.deferUpdate()

    const t = await fetchT(interaction)
    const avgPrice = await MarketService.minActivePrice(db, data.material)

    const container = buildDurationSelectContainer(
      data.ownerId,
      data.material,
      avgPrice,
      t
    )
    await interaction.editReply(v2EditPayload([container]))
  }
}
