import { Command } from '@sapphire/framework'
import Embed from '@utils/Embed'
import config from '../../config'

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client, i18n } = this.container
    const t = await i18n.changeLanguage(config.i18n.options.lng ?? 'en')

    const loadEmbed = new Embed(client, 'warn').setTitle(
      t('command.ping.loading.title')
    )
    const m = await interaction.reply({
      embeds: [loadEmbed],
      fetchReply: true
    })

    const successEmbed = new Embed(client, 'success')
      .setTitle(t('command.ping.success.title'))
      .addFields([
        {
          name: t('command.ping.success.fields.message'),
          value: `${m.createdTimestamp - interaction.createdTimestamp}ms`,
          inline: true
        },
        {
          name: t('command.ping.success.fields.api'),
          value: `${client.ws.ping}ms`,
          inline: true
        },
        {
          name: t('command.ping.success.fields.uptime'),
          value: `<t:${(Number(client.readyAt) / 1000) | 0}:R>`,
          inline: true
        }
      ])

    await interaction.editReply({ embeds: [successEmbed] })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('ping')
        .setDescription('Check the latency of the bot.')
        .setNameLocalization('ko', '핑')
        .setDescriptionLocalization('ko', '핑을 측정합니다.')
    )
  }
}
