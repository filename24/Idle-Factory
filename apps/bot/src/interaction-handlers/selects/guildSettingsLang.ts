/**
 * 길드 설정 — 언어 변경 select 핸들러.
 *
 * customId: `guild:settings:lang:<guildId>`.
 *
 * 흐름:
 *  1. `ManageGuild` 권한 검증.
 *  2. `GuildService.updateLang` 적용.
 *  3. 갱신된 값으로 동일 패널 재렌더 (`interaction.update`).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  PermissionFlagsBits,
  type StringSelectMenuInteraction
} from 'discord.js'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { GUILD_SETTINGS_LANG_PREFIX } from '@utils/Constants'
import {
  buildGuildSettingsContainer,
  GUILD_LANG_CHOICES
} from '@structures/renderers'
import { GuildService } from '../../services/guild'

export class GuildSettingsLangSelectHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.SelectMenu
    })
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    if (!interaction.customId.startsWith(GUILD_SETTINGS_LANG_PREFIX)) {
      return this.none()
    }
    const guildId = interaction.customId.slice(
      GUILD_SETTINGS_LANG_PREFIX.length
    )
    if (!/^\d{5,25}$/.test(guildId)) return this.none()
    const value = interaction.values[0]
    if (!value || !GUILD_LANG_CHOICES.includes(value)) return this.none()
    return this.some({ guildId, lang: value })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { guildId: string; lang: string }
  ): Promise<void> {
    const t = await fetchT(interaction)

    if (
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) ||
      interaction.guildId !== data.guildId
    ) {
      await replyDenied(interaction, t)
      return
    }

    await interaction.deferUpdate()
    const updated = await GuildService.updateLang(
      this.container.db,
      data.guildId,
      data.lang
    )
    // 갱신된 값을 반영한 다국어로 다시 fetchT (현재 interaction.locale 와 다를 수 있음).
    const t2 = await fetchT(interaction)
    await interaction.editReply({
      components: [buildGuildSettingsContainer(updated, t2)]
    } as Parameters<typeof interaction.editReply>[0])
  }
}

async function replyDenied(
  interaction: StringSelectMenuInteraction,
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
