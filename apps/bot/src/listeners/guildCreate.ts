import { Listener, Events } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { Guild } from 'discord.js'
import Embed from '@utils/Embed'

export class GuildCreateListener extends Listener<typeof Events.GuildCreate> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.GuildCreate })
  }

  public async run(guild: Guild) {
    const { client, db } = this.container
    const t = await fetchT(guild)

    const guildData = await db.guild.upsert({
      where: { id: guild.id },
      create: { id: guild.id, name: guild.name, tax: 0.1 },
      update: { name: guild.name }
    })

    const embed = new Embed(client, 'success')
      .setTitle(t('embeds:event.guildCreate.title'))
      .setDescription(t('embeds:event.guildCreate.description'))
      .addFields({
        name: t('embeds:event.guildCreate.default.tax'),
        value: `${guildData.tax}%`
      })

    guild.systemChannel?.send({ embeds: [embed] }).catch(async () => {
      ;(await guild.members.fetch(guild.ownerId)).send({ embeds: [embed] })
    })
  }
}
