import 'dotenv/config'
import '@sapphire/plugin-i18next/register'
import Logger from '@utils/Logger'
import config from './config'
import BotClient from '@structures/BotClient'

const logger = new Logger('main')

logger.log('Starting up...')

process.on('uncaughtException', (e) => logger.error(e.stack as string))
process.on('unhandledRejection', (e: Error) => logger.error(e.stack as string))

const client = new BotClient(config.bot.options)
await client.login(config.bot.token)
