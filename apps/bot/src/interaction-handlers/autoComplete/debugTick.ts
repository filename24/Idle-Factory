/**
 * `/debug` 의 `tick` 옵션 autocomplete 핸들러.
 *
 * `advance-harvest` / `harvest-now` 두 서브커맨드가 공통으로 쓰는 `tick` 옵션에
 * "N시간 뒤 · M tick" / "N일 뒤 · M tick" 사람 친화 템플릿을 제공한다. 숫자를
 * 입력하면 시간/일/직접(tick) 해석을 제시한다. 값은 항상 tick 정수.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction
} from 'discord.js'

import { tickAutocompleteTemplates } from '../../utils/debugTickTemplates'

/** `tick` 옵션을 autocomplete 하는 `/debug` 서브커맨드 목록. */
const TICK_OPTION_SUBCOMMANDS = new Set(['advance-harvest', 'harvest-now'])

export class DebugTickAutocomplete extends InteractionHandler {
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
    if (!TICK_OPTION_SUBCOMMANDS.has(interaction.options.getSubcommand())) {
      return this.none()
    }
    if (interaction.options.getFocused(true).name !== 'tick') return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const templates = tickAutocompleteTemplates(
      String(interaction.options.getFocused())
    )
    const data: ApplicationCommandOptionChoiceData[] = templates.map((t) => ({
      name: t.name,
      value: t.value
    }))
    await interaction.respond(data)
  }
}
