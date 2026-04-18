import { Command } from '@sapphire/framework'

export class NoticeCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const option = interaction.options.getString('옵션') as 'delete' | 'send'
    const id = interaction.options.getString('id')

    if (option === 'delete' && !id) {
      return interaction.reply({
        content: '삭제 옵션을 사용하려면 ID를 입력해야 합니다.',
        ephemeral: true
      })
    }
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('공지')
        .setDescription('공지를 삭제하거나 전송합니다.')
        .addStringOption((option) =>
          option
            .setName('옵션')
            .setDescription('공지 옵션')
            .setRequired(true)
            .setChoices(
              { name: '삭제', value: 'delete' },
              { name: '전송', value: 'send' }
            )
        )
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('공지 ID (삭제 옵션에서만 사용)')
            .setAutocomplete(true)
            .setRequired(false)
        )
    )
  }
}
