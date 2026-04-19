import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction
} from 'discord.js'

export class NoticeIdAutocomplete extends InteractionHandler {
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
    if (interaction.commandName !== '공지') return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused()
    const data = await this.container.db.notice.findMany({
      where: focused
        ? { title: { contains: focused, mode: 'insensitive' } }
        : undefined,
      take: 25,
      orderBy: { postedAt: 'desc' }
    })
    const choices: ApplicationCommandOptionChoiceData[] = data.map(
      (notice: { id: string; title: string }) => ({
        name: `${notice.id} (${notice.title})`,
        value: notice.id
      })
    )
    await interaction.respond(choices)
  }
}
