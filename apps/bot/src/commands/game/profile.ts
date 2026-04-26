/**
 * `/profile` 커맨드.
 *
 * 호출자의 프로필(레벨/XP/돈/창고 등급/공장 수)을 Components v2 컨테이너로 보여준다.
 *
 * XP 표시는 `xp / xpRequiredForLevel(level + 1)` 포맷(현재 누적 XP / 다음 레벨 요구량).
 * BigInt 필드는 `formatBigInt`로 천단위 구분 포맷팅한다.
 *
 * 참조: `docs/design/09-level-xp.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { xpRequiredForLevel } from '@idle/game-core'
import { formatBigInt } from '@structures/renderers'
import { UserService } from '../../services/user'

export class ProfileCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const hydrated = await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    const factoryCount = await db.factory.count({
      where: { userId: hydrated.id }
    })

    const level = hydrated.level
    const xp = hydrated.xp
    // 다음 레벨(level+1) 요구 XP. xpRequiredForLevel은 "해당 레벨에서 다음으로
    // 가기 위한" 요구량이므로 다음 레벨 기준은 level + 1 을 넘긴다.
    const xpNeeded = xpRequiredForLevel(level + 1)

    const displayName = hydrated.nickname ?? interaction.user.username

    const body = [
      `**${t('game:profile.fields.level')}:** ${level}`,
      `**${t('game:profile.fields.xp')}:** ${formatBigInt(xp)} / ${formatBigInt(xpNeeded)}`,
      `**${t('game:profile.fields.money')}:** ${formatBigInt(hydrated.money)} 💰`,
      `**${t('game:profile.fields.warehouseGrade')}:** G${hydrated.warehouse?.grade ?? 1}`,
      `**${t('game:profile.fields.factoryCount')}:** ${factoryCount}`
    ].join('\n')

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        title: t('game:profile.title', { nickname: displayName }),
        body,
        ephemeral: false
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('profile')
        .setDescription('Show your profile.')
        .setNameLocalization('ko', '프로필')
        .setDescriptionLocalization('ko', '내 프로필을 확인합니다.')
    )
  }
}
