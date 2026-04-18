import { Command } from '@sapphire/framework'
import Embed from '@utils/Embed'

export class AnnouncementCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client, i18n } = this.container
    const t = await i18n.changeLanguage('ko')

    const embed = new Embed(client, 'info').setTitle(t('command.notice.title'))
    await interaction.reply({ ephemeral: true, embeds: [embed] })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('announcement')
        .setDescription('Check the notice board')
        .setNameLocalization('ko', '공지사항')
        .setDescriptionLocalization('ko', '공지 게시판을 확인합니다')
    )
  }
}
