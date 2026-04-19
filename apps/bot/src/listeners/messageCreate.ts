import { Listener, Events } from '@sapphire/framework'
import type { Message } from 'discord.js'
import BotClient from '@structures/BotClient'

export class MessageCreateListener extends Listener<
  typeof Events.MessageCreate
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.MessageCreate })
  }

  public async run(message: Message) {
    const client = this.container.client as BotClient
    await client.dokdo.run(message)
  }
}
