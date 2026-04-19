import { Command } from '@sapphire/framework'
import { ApplicationCommandType } from 'discord.js'

export class ExampleContextMenuCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async contextMenuRun(
    _interaction: Command.ContextMenuCommandInteraction
  ) {}

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerContextMenuCommand((builder) =>
      builder.setName('context').setType(ApplicationCommandType.Message)
    )
  }
}
