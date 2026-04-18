import { Listener, Events } from '@sapphire/framework'
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
    const { client, db, i18n } = this.container

    const guildData = await db.guild.create({
      data: { id: guild.id, name: guild.name, tax: 0.1 }
    })

    const embed = new Embed(client, 'success')
      .setTitle(i18n.t('event.guildCreate.title'))
      .setDescription(i18n.t('event.guildCreate.description'))
      .addFields({
        name: i18n.t('event.guildCreate.default.tax'),
        value: `${guildData.tax}%`
      })

    guild.systemChannel?.send({ embeds: [embed] }).catch(async () => {
      ;(await guild.members.fetch(guild.ownerId)).send({ embeds: [embed] })
    })
  }
}
