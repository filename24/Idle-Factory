import { Listener, Events } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { Guild } from 'discord.js'
import {
  simpleContainer,
  v2MessageOptions,
  V2_ACCENT
} from '@utils/ComponentsV2'

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

    const guildData = await db.guild.upsert({
      where: { id: guild.id },
      create: { id: guild.id, name: guild.name, taxSurcharge: 0.1 },
      update: { name: guild.name }
    })

    const body = [
      t('embeds:event.guildCreate.description'),
      '',
      `**${t('embeds:event.guildCreate.default.tax')}:** ${guildData.taxSurcharge * 100}%`
    ].join('\n')

    const container = simpleContainer(
      V2_ACCENT.success,
      t('embeds:event.guildCreate.title'),
      body
    )
    const payload = v2MessageOptions([container])

    guild.systemChannel?.send(payload).catch(async () => {
      ;(await guild.members.fetch(guild.ownerId)).send(payload)
    })
  }
}
