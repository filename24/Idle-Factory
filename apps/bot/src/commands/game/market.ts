/**
 * `/market` 커맨드 그룹 (v1: list 만).
 *
 * 서브커맨드:
 *  - `list <material> <quantity> <price_per_unit> <duration>` — 마켓에 자재 등록.
 *
 * v1 에선 buy/cancel 미구현 (별도 PR). 등록 즉시 `MARKET_LISTED` 이벤트가 발화돼
 * Q3 ("자재 판매") 트리거를 살린다.
 *
 * 참조: docs/design/06-market.md, docs/design/00-onboarding.md §튜토리얼 퀘스트 #3
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import type { MaterialType } from '@idle/game-core'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { appendQuestCompletions } from '@utils/questNotifier'
import { ServiceError } from '../../services/base'
import { MarketService } from '../../services/market'
import { UserService } from '../../services/user'
import { localizeMaterial } from '../../utils/enumLocale'

const MATERIAL_CHOICES: readonly MaterialType[] = [
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

export class MarketCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    if (sub === 'list') return this.handleList(interaction)
    return this.replyError(interaction, 'game:common.error.unknown')
  }

  private async handleList(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const material = interaction.options.getString(
      'material',
      true
    ) as MaterialType
    const quantity = BigInt(interaction.options.getInteger('quantity', true))
    const pricePerUnit = BigInt(
      interaction.options.getInteger('price_per_unit', true)
    )
    const durationDays = interaction.options.getInteger('duration', true)

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketService.list(db, {
        userId: interaction.user.id,
        material,
        quantity,
        pricePerUnit,
        durationDays
      })

      const base = simpleV2Payload({
        accent: V2_ACCENT.success,
        title: t('game:market.list.success', {
          material: localizeMaterial(t, material),
          quantity: formatBigInt(quantity),
          price: formatBigInt(pricePerUnit)
        }),
        footer: t('game:market.list.footer', {
          tax: ((result.listing.taxRate ?? 0) * 100).toFixed(0)
        }),
        ephemeral: false
      })

      const enriched = appendQuestCompletions(base, result.quest, t)
      return interaction.reply(enriched)
    } catch (err) {
      return this.replyFromError(interaction, err)
    }
  }

  private async replyFromError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown
  ) {
    if (!(err instanceof ServiceError)) {
      this.container.logger.error(err)
      return this.replyError(interaction, 'game:common.error.unknown')
    }
    const t = await fetchT(interaction)
    const key = this.resolveErrorKey(err, t)
    return this.replyErrorRaw(interaction, key)
  }

  private resolveErrorKey(err: ServiceError, t: TFunction): string {
    switch (err.code) {
      case 'INVALID_QUANTITY':
        return t('game:market.list.error.invalidQuantity')
      case 'INVALID_PRICE':
        return t('game:market.list.error.invalidPrice')
      case 'INVALID_DURATION':
        return t('game:market.list.error.invalidDuration')
      case 'INSUFFICIENT_MATERIAL': {
        const det = (err.details ?? {}) as {
          required?: string
          have?: string
        }
        return t('game:market.list.error.insufficientStock', {
          required: det.required ?? '-',
          have: det.have ?? '-'
        })
      }
      case 'USER_NOT_FOUND':
        return t('game:common.error.userNotFound')
      default:
        return t('game:common.error.unknown')
    }
  }

  private async replyError(
    interaction: Command.ChatInputCommandInteraction,
    key: string
  ) {
    const t = await fetchT(interaction)
    return this.replyErrorRaw(interaction, t(key))
  }

  private async replyErrorRaw(
    interaction: Command.ChatInputCommandInteraction,
    body: string
  ) {
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body,
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
            .setDescription('List a material on the market.')
            .setDescriptionLocalization('ko', '자재를 마켓에 등록합니다.')
            .addStringOption((opt) =>
              opt
                .setName('material')
                .setDescription('Material to sell')
                .setDescriptionLocalization('ko', '판매할 자재')
                .setRequired(true)
                .addChoices(
                  ...MATERIAL_CHOICES.map((m) => ({ name: m, value: m }))
                )
            )
            .addIntegerOption((opt) =>
              opt
                .setName('quantity')
                .setDescription('Quantity to list (>=1)')
                .setDescriptionLocalization('ko', '등록 수량 (1 이상)')
                .setMinValue(1)
                .setRequired(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('price_per_unit')
                .setDescription('Price per unit (>=1)')
                .setDescriptionLocalization('ko', '개당 가격 (1 이상)')
                .setMinValue(1)
                .setRequired(true)
            )
            .addIntegerOption((opt) =>
              opt
                .setName('duration')
                .setDescription('Listing duration in days (1-30)')
                .setDescriptionLocalization('ko', '등록 기간 (1~30일)')
                .setMinValue(1)
                .setMaxValue(30)
                .setRequired(true)
            )
        )
    )
  }
}
