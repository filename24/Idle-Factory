import { SapphireClient, container } from '@sapphire/framework'
import { DatabaseClient } from '@idle/database'
import { type ClientOptions } from 'discord.js'
import i18next from 'i18next'
import Dokdo from 'dokdo'
import { fileURLToPath } from 'url'

import Logger from '@utils/Logger'
import config from '../config'

const logger = new Logger('bot')

export default class BotClient extends SapphireClient {
  public readonly VERSION: string
  public readonly BUILD_NUMBER: string
  public readonly config = config
  public readonly dokdo: Dokdo

  public constructor(options: ClientOptions) {
    super({
      ...options,
      baseUserDirectory: fileURLToPath(new URL('..', import.meta.url)),
      defaultPrefix: config.bot.prefix
    })

    this.VERSION = config.BUILD_VERSION
    this.BUILD_NUMBER = config.BUILD_NUMBER

    this.dokdo = new Dokdo(this, {
      prefix: config.bot.prefix,
      noPerm: async (message) =>
        message.reply('You do not have permission to use this command.'),
      owners: config.bot.owners?.length === 0 ? undefined : config.bot.owners
    })
  }

  public override async login(token = config.bot.token): Promise<string> {
    logger.info('Connecting to database...')
    container.db = new DatabaseClient()
    logger.info('Connected to Prisma')

    logger.info('Loading i18n...')
    await i18next.init(config.i18n.options)
    container.i18n = i18next
    logger.info('Loaded i18n')

    logger.info('Logging in bot...')
    return super.login(token)
  }

  public async setStatus(
    status: 'dev' | 'online' = 'online',
    name = '점검중...'
  ) {
    if (status === 'dev') {
      logger.warn('Changed status to Development mode')
      this.user?.setPresence({
        activities: [{ name: `/help | ${this.VERSION} : ${name}` }],
        status: 'dnd'
      })
    } else {
      logger.info('Changed status to Online mode')
      this.user?.setPresence({
        activities: [{ name: `/help | ${this.VERSION}` }],
        status: 'online'
      })
    }
  }
}
