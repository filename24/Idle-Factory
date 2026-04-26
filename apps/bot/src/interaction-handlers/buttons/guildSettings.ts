/**
 * 길드 설정 [⚙️ 서버 설정] 버튼 핸들러.
 *
 * customId: `guild:settings:open:<guildId>`.
 *
 * 흐름:
 *  1. 권한 검증 — `ManageGuild` 권한 보유자만 통과.
 *  2. Guild row 조회 (없으면 자동 등록).
 *  3. 현재 값을 default 로 표시한 select 패널을 ephemeral 로 응답.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { PermissionFlagsBits, type ButtonInteraction } from 'discord.js'
import { simpleV2Payload, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { GUILD_SETTINGS_OPEN_PREFIX } from '@utils/Constants'
import { buildGuildSettingsContainer } from '@structures/renderers'
import { GuildService } from '../../services/guild'

export class GuildSettingsOpenButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button
    })
  }

  public override parse(interaction: ButtonInteraction) {
    if (!interaction.customId.startsWith(GUILD_SETTINGS_OPEN_PREFIX)) {
      return this.none()
    }
    const guildId = interaction.customId.slice(
      GUILD_SETTINGS_OPEN_PREFIX.length
    )
    if (!/^\d{5,25}$/.test(guildId)) return this.none()
    return this.some({ guildId })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { guildId: string }
  ): Promise<void> {
    const t = await fetchT(interaction)

    if (!isManageGuildMember(interaction)) {
      await replyDenied(interaction, t)
      return
    }
    if (interaction.guildId !== data.guildId) {
      await replyDenied(interaction, t)
      return
    }

    const { db } = this.container
    const fresh = await db.guild.findUnique({ where: { id: data.guildId } })
    const row =
      fresh ??
      (await GuildService.upsertOnJoin(db, {
        guildId: data.guildId,
        name: interaction.guild?.name ?? data.guildId
      }))

    await interaction.reply({
      components: [buildGuildSettingsContainer(row, t)],
      flags: v2Flags(true)
    })
  }
}

function isManageGuildMember(interaction: ButtonInteraction): boolean {
  const perms = interaction.memberPermissions
  return perms?.has(PermissionFlagsBits.ManageGuild) === true
}

async function replyDenied(
  interaction: ButtonInteraction,
  t: TFunction
): Promise<void> {
  await interaction.reply(
    simpleV2Payload({
      accent: V2_ACCENT.warn,
      body: t('embeds:guildSettings.error.notAdmin'),
      ephemeral: true
    })
  )
}
