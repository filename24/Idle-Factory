/**
 * `/help` — 슬래시 명령 카탈로그 도움말.
 *
 * 명령 목록은 하드코딩하지 않고 Sapphire command store 를 런타임에 순회해서
 * 만든다. 목록을 손으로 적어두면 명령을 추가·삭제할 때마다 도움말이 조용히
 * 낡기 때문이다. 분류·정렬·멘션 해석 로직은 단위 테스트가 가능하도록
 * `utils/helpCatalog.ts` 에 있고, 이 피스는 그 결과를 Components v2 로 그린다.
 *
 * 표시 규칙:
 *  - 카테고리 = 명령 파일이 놓인 디렉터리(`Command#category`).
 *  - `dev` 카테고리는 owner 에게만 보인다. 판정 출처는 `OwnerOnly` precondition
 *    과 동일한 `BotClient.dokdo.owners` 다 (preconditions/OwnerOnly.ts 참조).
 *  - 응답은 ephemeral — 도움말은 채널을 어지럽힐 이유가 없다.
 *
 * 참조: `.claude/skills/componentsv2-builder/SKILL.md` (Components v2 전용 규약).
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import {
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} from 'discord.js'
import type BotClient from '@structures/BotClient'
import { v2Flags, V2_ACCENT } from '@utils/ComponentsV2'
import {
  groupCommandsByCategory,
  renderCommandLine,
  resolveVisibleCategories
} from '@utils/helpCatalog'

/**
 * 호출자 로케일에 바인딩된 번역 함수 타입.
 *
 * `i18next` 에서 `TFunction` 을 직접 import 하면 트리에 공존하는 두 i18next
 * 버전 때문에 `fetchT` 반환 타입과 충돌한다 (apps/bot/AGENTS.md 규약).
 */
type Translate = Awaited<ReturnType<typeof fetchT>>

/** `category` 옵션 이름 — 등록부와 파싱부가 같은 상수를 쓰도록 묶어둔다. */
const CATEGORY_OPTION = 'category'

export class HelpCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const t = await fetchT(interaction)

    const isOwner = (interaction.client as BotClient).dokdo.owners.includes(
      interaction.user.id
    )
    const requested = interaction.options.getString(CATEGORY_OPTION)
    const targets = resolveVisibleCategories(isOwner, requested)

    if (targets.length === 0) {
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(V2_ACCENT.error)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `# **${t('embeds:command.help.title')}**`
              )
            )
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                t('embeds:command.help.unknownCategory')
              )
            )
        ],
        flags: v2Flags(true)
      })
      return
    }

    const grouped = groupCommandsByCategory(
      this.container.stores.get('commands').values()
    )

    const container = new ContainerBuilder()
      .setAccentColor(V2_ACCENT.info)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# **${t('embeds:command.help.title')}**`
        )
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(t('embeds:command.help.intro'))
      )

    // 전체 보기일 때만 온보딩 흐름을 얹는다. 분류를 콕 집어 물어본 사용자에게는
    // 군더더기다.
    if (!requested) {
      container.addSeparatorComponents(this.separator())
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${t('embeds:command.help.gettingStarted.title')}`,
            t('embeds:command.help.gettingStarted.body')
          ].join('\n')
        )
      )
    }

    for (const category of targets) {
      const commands = grouped.get(category)
      if (!commands || commands.length === 0) continue

      container.addSeparatorComponents(this.separator())
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `## ${t(`embeds:command.help.categories.${category}`)}`,
            ...commands.map((command) =>
              renderCommandLine(
                this.translator(t),
                command,
                interaction.guildId
              )
            )
          ].join('\n')
        )
      )
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# ${t('embeds:command.help.footer')}`
      )
    )

    await interaction.reply({
      components: [container],
      flags: v2Flags(true)
    })
  }

  /**
   * `helpCatalog` 가 요구하는 `(key, defaultValue) => string` 형태로 i18next 를
   * 감싼다. 헬퍼가 i18next 타입에 직접 묶이지 않게 하려는 어댑터다.
   *
   * @param t 호출자 로케일에 바인딩된 번역 함수
   */
  private translator(t: Translate) {
    return (key: string, defaultValue: string): string =>
      t(key, { defaultValue })
  }

  /** 섹션 사이 구분선 — 봇 전체가 쓰는 Small 분할선과 동일하게 맞춘다. */
  private separator(): SeparatorBuilder {
    return new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('help')
        .setDescription('Show every command you can use.')
        .setNameLocalization('ko', '도움말')
        .setDescriptionLocalization('ko', '사용할 수 있는 명령을 모두 봅니다.')
        .addStringOption((option) =>
          option
            .setName(CATEGORY_OPTION)
            .setDescription('Show only one category.')
            .setNameLocalization('ko', '분류')
            .setDescriptionLocalization('ko', '한 분류만 골라서 봅니다.')
            .setRequired(false)
            .addChoices(
              {
                name: 'game',
                name_localizations: { ko: '게임' },
                value: 'game'
              },
              {
                name: 'info',
                name_localizations: { ko: '정보' },
                value: 'info'
              },
              {
                name: 'settings',
                name_localizations: { ko: '설정' },
                value: 'settings'
              }
            )
        )
    )
  }
}
