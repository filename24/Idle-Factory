import { SlashCommand } from '@structures/Command'
import Embed from '@utils/Embed'
import { SlashCommandBuilder } from 'discord.js'

export default new SlashCommand(
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription(
      'Setting commands that can be seen as starting Idle factory'
    )
    .setDescriptionLocalization(
      'ko',
      'Idle factory 시작이라고 볼수있는 세팅 명령어!'
    )
    .setNameLocalization('ko', '세팅')
    .toJSON(),
  async (client, interaction, i18n) => {
    const guildData = await client.db.guild.findFirst({
      where: {
        id: interaction.guildId!
      }
    })

    if (guildData)
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new Embed(client, 'error')
            .setTitle(i18n('command.setup.available.title', guildData.name))
            .setDescription(i18n('command.setup.available.description'))
        ]
      })
  }
)
