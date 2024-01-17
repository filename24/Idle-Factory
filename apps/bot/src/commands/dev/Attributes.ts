import {
  ActionRowBuilder,
  APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder
} from 'discord.js'
import { SlashCommand } from '@structures/Command'
import { getRandomAttributes } from '@utils/Algorithms'
import Embed from '@utils/Embed'

export default new SlashCommand(
  new SlashCommandBuilder()
    .setName('attributes')
    .setNameLocalization('ko', '특성')
    .setDescription('특성 뽑기')
    .toJSON(),
  async (client, interaction) => {
    const attributes = getRandomAttributes()

    const fields: APIEmbedField[] = [
      {
        name: '지원자',
        value: getRandomKoreanFood(),
        inline: true
      },
      {
        name: '특성',
        value: '** **',
        inline: false
      },
      {
        name: '힘',
        value: String(attributes.strength),
        inline: true
      },
      {
        name: '달리기',
        value: String(attributes.athletics),
        inline: true
      },
      {
        name: '작동',
        value: String(attributes.machinery),
        inline: true
      }
    ]
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('reroll')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔄')
        .setLabel('다시 뽑기'),
      new ButtonBuilder()
        .setLabel('합격')
        .setEmoji('✅')
        .setCustomId('accept')
        .setStyle(ButtonStyle.Success)
    )
    const embed = new Embed(client, 'info')
      .setTitle('공장 직원 특성')
      .addFields(fields)

    await interaction.reply({
      embeds: [embed],
      components: [row]
    })

    const collector = interaction.channel?.createMessageComponentCollector({
      idle: 1 * 60 * 1000,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        ['accept', 'reroll'].includes(i.customId),
      componentType: ComponentType.Button
    })

    collector?.on('collect', async (i) => {
      if (i.customId === 'reroll') {
        const attributes = getRandomAttributes()

        const fields: APIEmbedField[] = [
          {
            name: '지원자',
            value: getRandomKoreanFood(),
            inline: true
          },
          {
            name: '특성',
            value: '** **',
            inline: false
          },
          {
            name: '힘',
            value: String(attributes.strength),
            inline: true
          },
          {
            name: '달리기',
            value: String(attributes.athletics),
            inline: true
          },
          {
            name: '작동',
            value: String(attributes.machinery),
            inline: true
          }
        ]
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId('reroll')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔄')
            .setLabel('다시 뽑기'),
          new ButtonBuilder()
            .setLabel('합격')
            .setEmoji('✅')
            .setCustomId('accept')
            .setStyle(ButtonStyle.Success)
        )
        const embed = new Embed(client, 'info')
          .setTitle('공장 직원 특성')
          .addFields(fields)

        await i.update({
          embeds: [embed],
          components: [row]
        })
      } else if (i.customId === 'accept') {
        await i.deferReply()

        await i.followUp('성공적으로 해당 직원을 공장에 지원했습니다!')
      }
    })
  }
)

export function getRandomKoreanFood(): string {
  const foods = [
    '김치찌개',
    '된장찌개',
    '마라탕',
    '짜장면',
    '짬뽕',
    '라면',
    '볶음밥',
    '연어초밥',
    '치킨',
    '탕수육',
    '계란말이',
    '삼겹살',
    '소고기',
    '스테이크',
    '양념치킨',
    '양념갈비',
    '갈비찜',
    '갈비탕'
  ]

  return foods[Math.floor(Math.random() * foods.length)]
}
