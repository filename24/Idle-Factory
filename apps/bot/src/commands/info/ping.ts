import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleContainer, v2Flags, V2_ACCENT } from '@utils/ComponentsV2'

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client } = this.container
    const t = await fetchT(interaction)

    const loadContainer = simpleContainer(
      V2_ACCENT.warn,
      t('embeds:command.ping.loading.title')
    )
    await interaction.reply({
      components: [loadContainer],
      flags: v2Flags()
    })
    const sent = await interaction.fetchReply()

    const body = [
      `**${t('embeds:command.ping.success.fields.message')}:** ${
        sent.createdTimestamp - interaction.createdTimestamp
      }ms`,
      `**${t('embeds:command.ping.success.fields.api')}:** ${client.ws.ping}ms`,
      `**${t('embeds:command.ping.success.fields.uptime')}:** <t:${
        (Number(client.readyAt) / 1000) | 0
      }:R>`
    ].join('\n')

    const successContainer = simpleContainer(
      V2_ACCENT.success,
      t('embeds:command.ping.success.title'),
      body
    )

    await interaction.editReply({
      components: [successContainer],
      flags: v2Flags()
    })
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
