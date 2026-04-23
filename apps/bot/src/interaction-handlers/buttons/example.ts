import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type { ButtonInteraction } from 'discord.js'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2.js'

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
    await interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        body: 'You clicked the button!'
      })
    )
  }
}
