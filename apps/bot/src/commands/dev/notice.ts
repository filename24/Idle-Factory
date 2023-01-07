import { SlashCommandBuilder } from 'discord.js'
import { SlashCommand } from '../../structures/Command'

export default new SlashCommand(
  new SlashCommandBuilder()
    .setName('공지')
    .setDescription('공지를 삭제하거나 전송합니다.')
    .addStringOption((options) =>
      options
        .setName('옵션')
        .setDescription('공지 옵션')
        .setRequired(true)
        .setChoices(
          {
            name: '삭제',
            value: 'delete'
          },
          {
            name: '전송',
            value: 'send'
          }
        )
    )
    .addStringOption((options) =>
      options
        .setName('id')
        .setDescription('공지 ID (삭제 옵션에서만 사용)')
        .setAutocomplete(true)
        .setRequired(false)
    )
    .toJSON(),
  async (client, interaction) => {
    const options = interaction.options.getString('옵션') as 'delete' | 'send'
    const id = interaction.options.getString('id')

    if (options === 'delete') {
      if (!id)
        return interaction.reply({
          content: '삭제 옵션을 사용하려면 ID를 입력해야 합니다.',
          ephemeral: true
        })
    }
  }
)
