import { Command } from '@sapphire/framework'
import {
  ActionRowBuilder,
  type APIEmbedField,
  ButtonBuilder,
  ButtonStyle,
  ComponentType
} from 'discord.js'
import { getRandomAttributes } from '@utils/Algorithms'
import Embed from '@utils/Embed'

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

function buildAttributeFields(
  name: string,
  attrs: ReturnType<typeof getRandomAttributes>
): APIEmbedField[] {
  return [
    { name: '지원자', value: name, inline: true },
    { name: '특성', value: '** **', inline: false },
    { name: '힘', value: String(attrs.strength), inline: true },
    { name: '달리기', value: String(attrs.athletics), inline: true },
    { name: '작동', value: String(attrs.machinery), inline: true }
  ]
}

function buildRow() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
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
}

export class AttributesCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { client } = this.container
    const attrs = getRandomAttributes()
    const embed = new Embed(client, 'info')
      .setTitle('공장 직원 특성')
      .addFields(buildAttributeFields(getRandomKoreanFood(), attrs))

    await interaction.reply({ embeds: [embed], components: [buildRow()] })

    const collector = interaction.channel?.createMessageComponentCollector({
      idle: 60_000,
      filter: (i) =>
        i.user.id === interaction.user.id &&
        ['accept', 'reroll'].includes(i.customId),
      componentType: ComponentType.Button
    })

    collector?.on('collect', async (i) => {
      if (i.customId === 'reroll') {
        const newAttrs = getRandomAttributes()
        await i.update({
          embeds: [
            new Embed(client, 'info')
              .setTitle('공장 직원 특성')
              .addFields(buildAttributeFields(getRandomKoreanFood(), newAttrs))
          ],
          components: [buildRow()]
        })
      } else if (i.customId === 'accept') {
        await i.deferReply()
        await i.followUp('성공적으로 해당 직원을 공장에 지원했습니다!')
      }
    })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('attributes')
        .setDescription('특성 뽑기')
        .setNameLocalization('ko', '특성')
    )
  }
}
