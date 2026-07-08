/**
 * `/debug run-scheduler` 의 `task` 옵션 autocomplete 핸들러.
 *
 * 정적 choices 대신 런타임 scheduled-tasks 스토어를 열거해 후보를 만든다 —
 * 새 스케줄러 피스를 추가하면 debug 코드 수정 없이 자동으로 목록에 나타난다.
 * 입력값으로 부분 일치(대소문자 무시) 필터링한다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction
} from 'discord.js'

import {
  listSchedulerTaskNames,
  type SchedulerStore
} from '../../commands/dev/debug'

/** Discord autocomplete 응답 상한. */
const AUTOCOMPLETE_MAX = 25

export class DebugSchedulerAutocomplete extends InteractionHandler {
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
    if (interaction.options.getSubcommand() !== 'run-scheduler') {
      return this.none()
    }
    if (interaction.options.getFocused(true).name !== 'task') return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const store = this.container.stores.get(
      'scheduled-tasks'
    ) as unknown as SchedulerStore
    const focused = interaction.options.getFocused().toLowerCase()

    const choices: ApplicationCommandOptionChoiceData[] =
      listSchedulerTaskNames(store)
        .filter((name) => name.toLowerCase().includes(focused))
        .slice(0, AUTOCOMPLETE_MAX)
        .map((name) => ({ name, value: name }))

    await interaction.respond(choices)
  }
}
