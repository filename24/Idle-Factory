import { BaseCommand } from '../../structures/Command'
import Embed from '../../utils/Embed'
import { SlashCommandBuilder } from '@discordjs/builders'

export default new BaseCommand(
  {
    name: 'ping',
    description: '핑을 측정합니다.',
    aliases: ['핑', '측정', 'vld']
  },
  async (client, message, t) => {
    let embed = new Embed(client, 'warn').setTitle(
      t('command.ping.loading.title')
    )

    const m = await message.reply({
      embeds: [embed]
    })
    embed = new Embed(client, 'success')
      .setTitle(t('command.ping.success.title'))
      .addFields([
        {
          name: t('command.ping.success.fields.message'),
          value: `${Number(m.createdAt) - Number(message.createdAt)}ms`,
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

    m.edit({
      embeds: [embed]
    })
  },
  {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription('Check the latency of the bot.')
      .setNameLocalization('ko', '핑')
      .setDescriptionLocalization('ko', '핑을 측정합니다.')
      .toJSON(),
    options: {
      name: 'ping',
      isSlash: true
    },
    async execute(client, interaction, t) {
      const PingEmbed = new Embed(client, 'success')
        .setTitle(t('command.ping.success.title'))
        .addFields([
          {
            name: t('command.ping.success.fields.message'),
            value: `${Number(Date.now()) - Number(interaction.createdAt)}ms`,
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
      interaction.reply({ embeds: [PingEmbed] })
    }
  }
)
