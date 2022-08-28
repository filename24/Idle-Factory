import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../../structures/Command'
import Embed from '../../utils/Embed'

export default new SlashCommand(
  new SlashCommandBuilder()
    .setName('announcement')
    .setNameLocalization('ko', '공지사항')
    .setDescription('Check the notice board')
    .setDescriptionLocalization('ko', '공지 게시판을 확인합니다')
    .toJSON(),
  async (client, interaction) => {
    const embed = new Embed(client, 'info').setTitle(
      client.i18n.t('command.notice.title')
    )

    await interaction.reply({
      ephemeral: true,
      embeds: [embed]
    })
  }
)
