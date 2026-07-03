import 'dotenv/config'
import '@sapphire/plugin-i18next/register'
import '@sapphire/plugin-scheduled-tasks/register'
import { ShardingManager } from 'discord.js'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import config from './config'
import chalk from 'chalk'
import Logger from '@utils/Logger'

const logger = new Logger('ShardManager')

console.log(
  chalk.cyanBright(`
                  =========================================================


                              ${config.name}@${config.BUILD_NUMBER}
                            Version : ${config.BUILD_VERSION}


                  =========================================================`)
)

if (!config.bot.sharding) {
  await import('./bot')
} else {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  const manager = new ShardingManager(
    join(__dirname, './bot.js'),
    config.bot.shardingOptions ?? {}
  )
  manager.spawn()
  manager.on('shardCreate', (shard) => {
    logger.info(`Shard #${shard.id} created.`)
  })
}
