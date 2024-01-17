import { Event } from '@structures/Event'
import { Logger } from '@idle/utils'
const logger = new Logger('bot')

export default new Event(
  'ready',
  async (client) => {
    logger.info(`Logged ${client.user?.username}`)
  },
  { once: true }
)
