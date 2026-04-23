import { Command } from '@sapphire/framework'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2.js'

export class NoticeCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const option = interaction.options.getString('옵션') as 'delete' | 'send'
    const id = interaction.options.getString('id')
    const { db } = this.container

    if (option === 'delete') {
      if (!id) {
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: '삭제 옵션을 사용하려면 ID를 입력해야 합니다.',
            ephemeral: true
          })
        )
      }

      const existing = await db.notice.findUnique({ where: { id } })
      if (!existing) {
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: '해당 ID의 공지를 찾을 수 없습니다.',
            ephemeral: true
          })
        )
      }

      await db.notice.delete({ where: { id } })
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          body: `공지 \`${existing.title}\` 을(를) 삭제했습니다.`,
          ephemeral: true
        })
      )
    }

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.warn,
        body: '공지 전송 기능은 아직 구현되지 않았습니다.',
        ephemeral: true
      })
    )
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
