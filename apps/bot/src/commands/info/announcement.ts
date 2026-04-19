import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import Embed from '@utils/Embed'

export class AnnouncementCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client } = this.container
    const t = await fetchT(interaction)

    const embed = new Embed(client, 'info').setTitle(
      t('embeds:command.notice.title')
    )
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
