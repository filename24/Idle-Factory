/**
 * `/language` 커맨드 — 개인 언어 설정 패널을 연다.
 *
 * 봇이 응답할 언어는 `utils/language` 리졸버가 다음 순서로 정한다:
 *   User.lang > Guild.lang > 디스코드 클라이언트 로케일 > preferredLocale
 * 이 커맨드는 그중 1순위인 개인 설정을 만지는 유일한 진입점이다.
 *
 * 온보딩 동의 없이도 쓸 수 있어야 한다 — 동의 안내 자체가 언어에 걸려 있으므로
 * 게임 커맨드용 `Onboarding` precondition 을 걸지 않는다.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { MessageFlags } from 'discord.js'
import { buildUserSettingsContainer } from '@structures/renderers'
import { LANG_AUTO } from '@utils/language'

export class LanguageCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    // 아직 게임을 시작하지 않은 유저도 언어는 고를 수 있어야 한다. row 가 없으면
    // 저장된 설정이 없다는 뜻이므로 'auto' 로 그려주고, 실제 저장은 select 핸들러가
    // 유저 존재를 확인한 뒤 수행한다.
    const row = await db.user.findUnique({
      where: { id: interaction.user.id },
      select: { lang: true }
    })

    return interaction.reply({
      components: [
        buildUserSettingsContainer(
          { userId: interaction.user.id, lang: row?.lang ?? LANG_AUTO },
          t
        )
      ],
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('language')
        .setDescription('Choose the language the bot replies to you in.')
        .setNameLocalization('ko', '언어')
        .setDescriptionLocalization(
          'ko',
          '봇이 나에게 응답할 언어를 설정합니다.'
        )
    )
  }
}
