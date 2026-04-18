import {
  Listener,
  Events,
  type ChatInputCommandErrorPayload
} from '@sapphire/framework'
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

  public run(error: unknown, payload: ChatInputCommandErrorPayload) {
    const errorManager = new ErrorManager()
    errorManager.report(
      error instanceof Error ? error : new Error(String(error)),
      {
        executer: payload.interaction as any,
        isSend: true
      }
    )
  }
}
