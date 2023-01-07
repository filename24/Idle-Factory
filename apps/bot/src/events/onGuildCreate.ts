import { Event } from '../structures/Event'
import Embed from '../utils/Embed'

export default new Event('guildCreate', async (client, guild) => {
  const guildData = await client.db.guild.create({
    data: {
      id: guild.id,
      name: guild.name,
      tax: 0.1
    }
  })

  const embed = new Embed(client, 'success')
    .setTitle(client.i18n.t('event.guildCreate.title'))
    .setDescription(client.i18n.t('event.guildCreate.description'))
    .addFields({
      name: client.i18n.t('event.guildCreate.default.tax'),
      value: `${guildData.tax}%`
    })
  guild.systemChannel
    ?.send({
      embeds: [embed]
    })
    .catch(async () => {
      ;(await guild.members.fetch(guild.ownerId)).send({
        embeds: [embed]
      })
    })
})
