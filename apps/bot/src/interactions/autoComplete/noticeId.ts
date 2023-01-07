import { ApplicationCommandOptionChoiceData } from 'discord.js'
import { AutoComplete } from '../../structures/Interaction'

export default new AutoComplete('공지', async (client, interaction) => {
  const data = await client.db.notice.findMany()
  const choices: ApplicationCommandOptionChoiceData[] = []

  data.forEach((notice) => {
    choices.push({
      name: `${notice.id} (${notice.title})`,
      value: notice.id
    })
  })
  await interaction.respond(choices)
})
