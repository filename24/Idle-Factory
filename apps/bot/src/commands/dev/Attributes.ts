import { Command } from '@sapphire/framework'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  TextDisplayBuilder
} from 'discord.js'
import { getRandomAttributes } from '@utils/Algorithms'
import { simpleV2Payload, v2Flags, V2_ACCENT } from '@utils/ComponentsV2'

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

/** 특성 결과를 표시할 Components v2 Container 를 구성한다. */
function buildAttributeContainer(
  name: string,
  attrs: ReturnType<typeof getRandomAttributes>
): ContainerBuilder {
  const body = [
    `**지원자:** ${name}`,
    '',
    '## 특성',
    `**힘:** ${attrs.strength}`,
    `**달리기:** ${attrs.athletics}`,
    `**작동:** ${attrs.machinery}`
  ].join('\n')

  return new ContainerBuilder()
    .setAccentColor(V2_ACCENT.info)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# **공장 직원 특성**')
    )
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(body))
    .addActionRowComponents(buildRow())
}

/** 재뽑기 / 합격 버튼 행. */
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
    const attrs = getRandomAttributes()
    const container = buildAttributeContainer(getRandomKoreanFood(), attrs)

    await interaction.reply({
      components: [container],
      flags: v2Flags()
    })

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
        const next = buildAttributeContainer(getRandomKoreanFood(), newAttrs)
        await i.update({
          components: [next],
          flags: v2Flags()
        })
      } else if (i.customId === 'accept') {
        await i.deferUpdate()
        await i.followUp(
          simpleV2Payload({
            accent: V2_ACCENT.success,
            body: '성공적으로 해당 직원을 공장에 지원했습니다!',
            ephemeral: false
          })
        )
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
