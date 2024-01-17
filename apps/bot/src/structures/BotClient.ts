import { Client, ClientOptions, ClientEvents, Collection } from 'discord.js'
import { config as dotenvConfig } from 'dotenv'
import Dokdo from 'dokdo'
import { Job } from 'node-schedule'

import { Logger } from '@idle/utils'
import { BaseInteraction } from './Interaction'
import { Event } from './Event'

import config from '../config'

import CommandManager from '@managers/CommandManager'
import EventManager from '@managers/EventManager'
import ErrorManager from '@managers/ErrorManager'
import DatabaseManager from '@managers/DatabaseManager'
import InteractionManager from '@managers/InteractionManager'
import i18nManager from '@managers/i18nManager'
import { CacheName, CacheData } from '@types'
import { i18n } from 'i18next'
import { Command } from './Command'
import { DatabaseClient } from '@idle/database'

const logger = new Logger('bot')

export default class BotClient extends Client {
  public readonly VERSION: string
  public readonly BUILD_NUMBER: string
  public readonly config = config

  public commands: Collection<string, Command> = new Collection()
  public events: Collection<keyof ClientEvents, Event<keyof ClientEvents>> =
    new Collection()
  public errors: Collection<string, string> = new Collection()
  public interactions: Collection<string | string[], BaseInteraction> =
    new Collection()
  public schedules: Collection<string, Job> = new Collection()
  public cache: Collection<CacheName, CacheData<CacheName>> = new Collection()
  public db!: DatabaseClient

  public command: CommandManager = new CommandManager(this)
  public event: EventManager = new EventManager(this)
  public error: ErrorManager = new ErrorManager(this)
  public database: DatabaseManager = new DatabaseManager(this)
  public interaction: InteractionManager = new InteractionManager(this)
  public i18n: i18n = new i18nManager(this).i18n

  public dokdo: Dokdo = new Dokdo(this, {
    prefix: this.config.bot.prefix,
    noPerm: async (message) =>
      message.reply('You do not have permission to use this command.'),
    owners: config.bot.owners?.length === 0 ? undefined : config.bot.owners
  })

  public constructor(options: ClientOptions) {
    super(options)

    logger.info('Loading config data...')
    if (process.cwd().includes('apps')) dotenvConfig({ path: '../../.env' })
    else dotenvConfig()

    logger.info('Loading managers...')
    this.command.load()
    this.event.load()
    this.interaction.load()
    this.database.load()
    new i18nManager(this).load()

    logger.info('Loading version data...')
    this.VERSION = config.BUILD_VERSION
    this.BUILD_NUMBER = config.BUILD_NUMBER
  }

  public async start(token: string = config.bot.token): Promise<void> {
    logger.info('Logging in bot...')
    await this.login(token).then(() => this.setStatus())
  }

  public async setStatus(
    status: 'dev' | 'online' = 'online',
    name = '점검중...'
  ) {
    if (status.includes('dev')) {
      logger.warn('Changed status to Developent mode')
      this.user?.setPresence({
        activities: [{ name: `/help | ${this.VERSION} : ${name}` }],
        status: 'dnd'
      })
    } else if (status.includes('online')) {
      logger.info('Changed status to Online mode')

      this.user?.setPresence({
        activities: [{ name: `/help | ${this.VERSION}` }],
        status: 'online'
      })
    }
  }
}
