/**
 * `/debug` 의 `stock` 옵션 autocomplete 핸들러.
 *
 * `set-weekly-profit` / `set-stock-price` / `seed-stock-ticks` 세 서브커맨드가
 * 공통으로 쓰는 `stock` 옵션에 상장 종목 후보를 제공한다. cuid 종목 id 는 손으로
 * 입력하기 어려우므로 `StockService.searchListedForAutocomplete` 로 조회 서버
 * 기준 상장 종목을 노출한다(값은 종목 id).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction
} from 'discord.js'

import { StockService } from '../../services/stock'
import { localizeFactoryType } from '../../utils/enumLocale'

/** Discord autocomplete 응답 라벨 길이 한도. */
const AUTOCOMPLETE_NAME_MAX = 100

/** `stock` 옵션을 autocomplete 하는 `/debug` 서브커맨드 목록. */
const STOCK_OPTION_SUBCOMMANDS = new Set([
  'set-weekly-profit',
  'set-stock-price',
  'seed-stock-ticks'
])

export class DebugStockAutocomplete extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Autocomplete
    })
  }

  public override parse(interaction: AutocompleteInteraction) {
    if (interaction.commandName !== 'debug') return this.none()
    if (!STOCK_OPTION_SUBCOMMANDS.has(interaction.options.getSubcommand())) {
      return this.none()
    }
    if (interaction.options.getFocused(true).name !== 'stock')
      return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const t = await fetchT(interaction)
    const choices = await StockService.searchListedForAutocomplete(
      this.container.db,
      {
        query: String(interaction.options.getFocused()),
        limit: 25,
        guildId: interaction.guildId
      }
    )

    const data: ApplicationCommandOptionChoiceData[] = choices.map((c) => ({
      name: truncate(
        `${localizeFactoryType(t, c.factoryType)} · @${c.currentPrice.toString()} · #${c.id.slice(-6)}`,
        AUTOCOMPLETE_NAME_MAX
      ),
      value: c.id
    }))

    await interaction.respond(data)
  }
}

/** 라벨을 한도 이내로 자른다(초과 시 말줄임). */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
