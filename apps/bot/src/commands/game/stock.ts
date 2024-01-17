import { SlashCommand } from '@structures/Command'
import { SlashCommandBuilder } from 'discord.js'

export default new SlashCommand(
  new SlashCommandBuilder()
    .setName('stock')
    .setNameLocalization('ko', '주식')
    .setDescription('준비되셨나요? 주식 시장에 들어가보세요.')
    .addSubcommand((subCommand) =>
      subCommand
        .setName('info')
        .setNameLocalization('ko', '정보')
        .setDescription('주식 정보를 불러옵니다.')
        .addStringOption((option) =>
          option
            .setName('stock_name')
            .setNameLocalization('ko', '주식_이름')
            .setDescription('주식 이름을 적어주세요.')
            .setMinLength(2)
            .setAutocomplete(true)
        )
    )
    .addSubcommand((subCommand) =>
      subCommand
        .setName('buy')
        .setNameLocalization('ko', '매수')
        .setDescription('선택한 주식을 구입합니다.')
        .addStringOption((option) =>
          option
            .setAutocomplete(true)
            .setRequired(true)
            .setName('stock_name')
            .setNameLocalization('ko', '주식_이름')
            .setDescription('주식 이름을 적어주세요. ')
        )
    )
    .addSubcommand((subCommand) =>
      subCommand
        .setName('sell')
        .setNameLocalization('ko', '매도')
        .setDescription('선택한 주식을 판매합니다.')
        .addStringOption((option) =>
          option
            .setAutocomplete(true)
            .setRequired(true)
            .setName('stock_name')
            .setNameLocalization('ko', '주식_이름')
            .setDescription('주식 이름을 적어주세요. ')
        )
        .addIntegerOption((option) =>
          option
            .addChoices(
              {
                name: '모두',
                value: 20 << 20
              },
              {
                name: '반만',
                value: 20 << 15
              },
              {
                name: '4/1',
                value: 20 << 10
              }
            )
            .setRequired(true)
            .setName('stock_count')
            .setNameLocalization('ko', '갯수')
            .setDescription('판매할 갯수를 적어주세요.')
        )
    )
    .toJSON(),
  async (client, interaction) => {
    const subCommand = interaction.options.getSubcommand()

    const stock = {
      quantity: interaction.options.getInteger('stock_count', true),
      name: interaction.options.getString('stock_name', true)
    }
  }
)
