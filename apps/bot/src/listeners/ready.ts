import { Listener, Events } from '@sapphire/framework'
import type { Client } from 'discord.js'
import Logger from '@utils/Logger'
import BotClient from '@structures/BotClient'
import { startMarketExpireScheduler } from '../services/marketExpireScheduler'

const logger = new Logger('bot')

export class ReadyListener extends Listener<typeof Events.ClientReady> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, once: true, event: Events.ClientReady })
  }

  public async run(client: Client<true>) {
    logger.info(`Logged in as ${client.user.username}`)
    await (this.container.client as BotClient).setStatus('online')
    startMarketExpireScheduler()
  }
}
