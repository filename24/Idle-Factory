import { Logger } from '@idle/utils'
import BaseManager from './BaseManager'
import BotClient from '@structures/BotClient'
import { DatabaseClient } from '@idle/database'

/**
 * @extends {BaseManager}
 */
export default class DatabaseManager extends BaseManager {
  private logger: Logger

  constructor(client: BotClient) {
    super(client)

    this.logger = new Logger('DatabaseManager')
  }

  async load() {
    this.logger.debug('Using Prisma...')

    this.client.db = new DatabaseClient({})

    this.client.db.$connect().then(() => {
      this.logger.info('Connected to Prisma')
    })
  }
}
