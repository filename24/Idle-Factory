import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type { ButtonInteraction } from 'discord.js'

export class ExampleButtonHandler extends InteractionHandler {
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
    if (interaction.customId !== 'button') return this.none()
    return this.some()
  }

  public async run(interaction: ButtonInteraction) {
    await interaction.reply('You clicked the button!')
  }
}
