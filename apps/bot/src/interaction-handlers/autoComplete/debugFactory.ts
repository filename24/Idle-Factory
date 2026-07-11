/**
 * `/debug` 의 `factory` 옵션 autocomplete 핸들러.
 *
 * `set-grade` / `set-booster` / `advance-harvest` / `harvest-now` 서브커맨드가
 * 공통으로 쓰는 `factory` 옵션에 호출자 소유 공장을 후보로 제공한다. cuid 공장 id 는
 * 손으로 입력하기 어려우므로 `FactoryService.searchOwnedForAutocomplete` 로 최신순
 * 공장을 노출한다(값은 공장 id).
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

import { FactoryService } from '../../services/factory'
import { localizeFactoryType } from '../../utils/enumLocale'
import { formatDebugFactoryLabel } from '../../utils/debugFactoryOptions'

/** Discord autocomplete 응답 라벨 길이 한도. */
const AUTOCOMPLETE_NAME_MAX = 100

/** `factory` 옵션을 autocomplete 하는 `/debug` 서브커맨드 목록. */
const FACTORY_OPTION_SUBCOMMANDS = new Set([
  'set-grade',
  'set-booster',
  'advance-harvest',
  'harvest-now'
])

export class DebugFactoryAutocomplete extends InteractionHandler {
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
    if (!FACTORY_OPTION_SUBCOMMANDS.has(interaction.options.getSubcommand())) {
      return this.none()
    }
    if (interaction.options.getFocused(true).name !== 'factory')
      return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const t = await fetchT(interaction)
    const factories = await FactoryService.searchOwnedForAutocomplete(
      this.container.db,
      {
        userId: interaction.user.id,
        query: String(interaction.options.getFocused()),
        limit: 25
      }
    )

    const data: ApplicationCommandOptionChoiceData[] = factories.map((f) => ({
      name: truncate(
        formatDebugFactoryLabel({
          typeLabel: localizeFactoryType(t, f.type),
          grade: f.grade,
          upgradeBooster: f.upgradeBooster,
          hasRawBooster: f.hasRawBooster,
          id: f.id
        }),
        AUTOCOMPLETE_NAME_MAX
      ),
      value: f.id
    }))

    await interaction.respond(data)
  }
}

/** 라벨을 한도 이내로 자른다(초과 시 말줄임). */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}
