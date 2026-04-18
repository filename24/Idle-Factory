import {
  Listener,
  Events,
  type ChatInputCommandErrorPayload
} from '@sapphire/framework'
import type { ChatInputCommandInteraction } from 'discord.js'
import ErrorManager from '@managers/ErrorManager'

export class ChatInputCommandErrorListener extends Listener<
  typeof Events.ChatInputCommandError
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, {
      ...options,
      event: Events.ChatInputCommandError
    })
  }

  public async run(error: unknown, payload: ChatInputCommandErrorPayload) {
    const errorManager = new ErrorManager()
    await errorManager.report(
      error instanceof Error ? error : new Error(String(error)),
      {
        executer: payload.interaction as ChatInputCommandInteraction<'cached'>,
        isSend: true
      }
    )
  }
}
