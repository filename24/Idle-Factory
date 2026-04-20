/**
 * `/profile` 커맨드.
 *
 * 호출자의 프로필(레벨/XP/돈/창고 등급/공장 수)을 ephemeral Embed로 보여준다.
 *
 * XP 표시는 `xp / xpRequiredForLevel(level + 1)` 포맷(현재 누적 XP / 다음 레벨 요구량).
 * BigInt 필드는 `formatBigInt`로 천단위 구분 포맷팅한다.
 *
 * 참조: `docs/design/09-level-xp.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import Embed from '@utils/Embed'
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
    const { client, db } = this.container
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

    const embed = new Embed(client, 'info')
      .setTitle(t('game:profile.title', { nickname: displayName }))
      .addFields([
        {
          name: t('game:profile.fields.level'),
          value: `${level}`,
          inline: true
        },
        {
          name: t('game:profile.fields.xp'),
          value: `${formatBigInt(xp)} / ${formatBigInt(xpNeeded)}`,
          inline: true
        },
        {
          name: t('game:profile.fields.money'),
          value: `${formatBigInt(hydrated.money)} 💰`,
          inline: true
        },
        {
          name: t('game:profile.fields.warehouseGrade'),
          value: `G${hydrated.warehouse?.grade ?? 1}`,
          inline: true
        },
        {
          name: t('game:profile.fields.factoryCount'),
          value: `${factoryCount}`,
          inline: true
        }
      ])

    return interaction.reply({ ephemeral: true, embeds: [embed] })
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
