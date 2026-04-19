import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type { ModalSubmitInteraction } from 'discord.js'

export class ExampleModalHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.ModalSubmit
    })
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (interaction.customId !== 'modal') return this.none()
    return this.some()
  }

  public async run(_interaction: ModalSubmitInteraction) {}
}
