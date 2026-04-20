import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'

export class AnnouncementCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const t = await fetchT(interaction)

    await interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        title: t('embeds:command.notice.title'),
        body: '-',
        ephemeral: true
      })
    )
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
