import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import Embed from '@utils/Embed'

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client } = this.container
    const t = await fetchT(interaction)

    const loadEmbed = new Embed(client, 'warn').setTitle(
      t('embeds:command.ping.loading.title')
    )
    const m = await interaction.reply({
      embeds: [loadEmbed],
      fetchReply: true
    })

    const successEmbed = new Embed(client, 'success')
      .setTitle(t('embeds:command.ping.success.title'))
      .addFields([
        {
          name: t('embeds:command.ping.success.fields.message'),
          value: `${m.createdTimestamp - interaction.createdTimestamp}ms`,
          inline: true
        },
        {
          name: t('embeds:command.ping.success.fields.api'),
          value: `${client.ws.ping}ms`,
          inline: true
        },
        {
          name: t('embeds:command.ping.success.fields.uptime'),
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
