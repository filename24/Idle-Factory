import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type { AnySelectMenuInteraction } from 'discord.js'

export class ExampleSelectHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.SelectMenu
    })
  }

  public override parse(interaction: AnySelectMenuInteraction) {
    if (interaction.customId !== 'selectMenu') return this.none()
    return this.some()
  }

  public async run(_interaction: AnySelectMenuInteraction) {}
}
