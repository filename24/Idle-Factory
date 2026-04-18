import { Command } from '@sapphire/framework'
import Embed from '@utils/Embed'
import config from '../../config'

export class SetupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client, db, i18n } = this.container
    const t = await i18n.changeLanguage(config.i18n.options.lng ?? 'en')

    const guildData = await db.guild.findFirst({
      where: { id: interaction.guildId! }
    })

    if (guildData) {
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new Embed(client, 'error')
            .setTitle(
              t('command.setup.available.title', {
                factoryName: guildData.name
              })
            )
            .setDescription(t('command.setup.available.description'))
        ]
      })
    }

    const guild = interaction.guild
    if (!guild) {
      return interaction.reply({
        content: '길드 정보를 가져올 수 없습니다.',
        ephemeral: true
      })
    }

    const created = await db.guild.create({
      data: {
        id: guild.id,
        name: guild.name,
        lang: config.i18n.options.lng ?? 'en'
      }
    })

    return interaction.reply({
      ephemeral: true,
      embeds: [
        new Embed(client, 'success')
          .setTitle(
            t('command.setup.success.title', { factoryName: created.name })
          )
          .setDescription(t('command.setup.success.description'))
      ]
    })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('setup')
        .setDescription(
          'Setting commands that can be seen as starting Idle factory'
        )
        .setNameLocalization('ko', '세팅')
        .setDescriptionLocalization(
          'ko',
          'Idle factory 시작이라고 볼수있는 세팅 명령어!'
        )
    )
  }
}
