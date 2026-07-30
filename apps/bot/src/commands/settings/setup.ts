import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { isSupportedLanguage } from '@utils/language'

export class SetupCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const guildData = await db.guild.findFirst({
      where: { id: interaction.guildId! }
    })

    if (guildData) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          title: t('embeds:command.setup.available.title', {
            factoryName: guildData.name
          }),
          body: t('embeds:command.setup.available.description'),
          ephemeral: false
        })
      )
    }

    const guild = interaction.guild
    if (!guild) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: '길드 정보를 가져올 수 없습니다.',
          ephemeral: false
        })
      )
    }

    const created = await db.guild.create({
      data: {
        id: guild.id,
        name: guild.name,
        // 번역 리소스가 없는 로케일(ja, fr …)을 그대로 저장하면 리졸버가 무시하고
        // 설정 패널에는 raw 코드가 그대로 노출된다. 지원 목록으로 클램프한다.
        lang: isSupportedLanguage(interaction.locale)
          ? interaction.locale
          : 'en-US'
      }
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: t('embeds:command.setup.success.title', {
          factoryName: created.name
        }),
        body: t('embeds:command.setup.success.description'),
        ephemeral: false
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('setup')
        .setDescription(
          'Setting commands that can be seen as starting Idle factory'
        )
        .setNameLocalization('ko', '세팅')
        .setDescriptionLocalization(
          'ko',
          'Idle factory 시작이라고 볼수있는 세팅 명령어!'
        )
    )
  }
}
