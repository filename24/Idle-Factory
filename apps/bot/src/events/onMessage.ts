import { Event } from '@structures/Event'

export default new Event('messageCreate', async (client, message) => {
  await client.dokdo.run(message)
})
