/**
 * 길드 설정 — 세율 변경 select 핸들러.
 *
 * customId: `guild:settings:tax:<guildId>`.
 *
 * 흐름:
 *  1. `ManageGuild` 권한 검증.
 *  2. `GuildService.updateTaxSurcharge` 적용 (0~0.2 범위 강제).
 *  3. 갱신된 값으로 동일 패널 재렌더.
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
import { GUILD_SETTINGS_TAX_PREFIX } from '@utils/Constants'
import {
  buildGuildSettingsContainer,
  GUILD_TAX_CHOICES
} from '@structures/renderers'
import { GuildService } from '../../services/guild'

export class GuildSettingsTaxSelectHandler extends InteractionHandler {
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
    if (!interaction.customId.startsWith(GUILD_SETTINGS_TAX_PREFIX)) {
      return this.none()
    }
    const guildId = interaction.customId.slice(GUILD_SETTINGS_TAX_PREFIX.length)
    if (!/^\d{5,25}$/.test(guildId)) return this.none()
    const raw = interaction.values[0]
    if (!raw) return this.none()
    const surcharge = Number.parseFloat(raw)
    if (
      !Number.isFinite(surcharge) ||
      !GUILD_TAX_CHOICES.some((c) => Math.abs(c - surcharge) < 1e-9)
    ) {
      return this.none()
    }
    return this.some({ guildId, surcharge })
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { guildId: string; surcharge: number }
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
    const updated = await GuildService.updateTaxSurcharge(
      this.container.db,
      data.guildId,
      data.surcharge
    )
    await interaction.editReply({
      components: [buildGuildSettingsContainer(updated, t)]
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
