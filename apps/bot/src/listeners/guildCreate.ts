/**
 * 봇이 새 길드에 들어왔을 때 호출되는 리스너.
 *
 * 책임:
 *  1. `Guild` row upsert (재초대 시 `leftAt` 클리어 — `InactiveServerPool` 분배 정합성).
 *  2. systemChannel 에 환영 메시지 + [⚙️ 서버 설정] 버튼 송신, 실패 시 owner DM 안전 폴백.
 *
 * 참조: docs/design/07-server.md §세금·정산, §비활성 서버 풀
 */

import { Listener, Events } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type Guild
} from 'discord.js'
import {
  simpleContainer,
  v2MessageOptions,
  V2_ACCENT
} from '@utils/ComponentsV2'
import { GUILD_SETTINGS_OPEN_PREFIX } from '@utils/Constants'
import Logger from '@utils/Logger'
import { GuildService } from '../services/guild'

const logger = new Logger('guildCreate')

export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.GuildCreate })
  }

  public async run(guild: Guild) {
    const { db } = this.container
    const t = await fetchT(guild)

    const guildData = await GuildService.upsertOnJoin(db, {
      guildId: guild.id,
      name: guild.name
    })

    const body = [
      t('embeds:event.guildCreate.description'),
      '',
      `**${t('embeds:event.guildCreate.default.tax')}:** ${(guildData.taxSurcharge * 100).toFixed(0)}%`
    ].join('\n')

    const container = simpleContainer(
      V2_ACCENT.success,
      t('embeds:event.guildCreate.title'),
      body
    )
    const settingsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${GUILD_SETTINGS_OPEN_PREFIX}${guild.id}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel(t('embeds:event.guildCreate.openSettings'))
    )
    container.addActionRowComponents(settingsRow)

    const payload = v2MessageOptions([container])

    // systemChannel 송신을 시도 → 실패하면 owner DM. 둘 다 실패해도 봇이 죽으면 안 되니
    // 안쪽 reject 까지 모두 caught.
    const channel = guild.systemChannel
    const me = guild.members.me
    const canSendToSystem =
      channel != null &&
      me != null &&
      channel.permissionsFor(me).has(PermissionFlagsBits.SendMessages)

    if (canSendToSystem) {
      try {
        await channel.send(payload)
        return
      } catch (err) {
        logger.warn(`systemChannel send failed for ${guild.id}: ${String(err)}`)
      }
    }

    try {
      const owner = await guild.members.fetch(guild.ownerId)
      await owner.send(payload)
    } catch (err) {
      logger.warn(`owner DM fallback failed for ${guild.id}: ${String(err)}`)
    }
  }
}
