import {
  AutocompleteInteraction,
  ButtonInteraction,
  ContextMenuCommandInteraction,
  Interaction,
  ModalSubmitInteraction,
  RESTPostAPIApplicationCommandsJSONBody,
  SelectMenuInteraction
} from 'discord.js'
import { InteractionType } from '@utils/Constants'
import BotClient from './BotClient'

export class Button {
  public type: InteractionType.Button = InteractionType.Button
  constructor(
    public customId: string | string[],
    public execute: BaseInteractionFunction<ButtonInteraction<'cached'>>
  ) {}
}

export class SelectMenu {
  public type: InteractionType.Select = InteractionType.Select
  constructor(
    public customId: string | string[],
    public execute: BaseInteractionFunction<SelectMenuInteraction<'cached'>>
  ) {}
}

export class ContextMenu {
  public type: InteractionType.ContextMenu = InteractionType.ContextMenu
  constructor(
    public customId: string | string[],
    public data: InteractionData,
    public execute: BaseInteractionFunction<
      ContextMenuCommandInteraction<'cached'>
    >
  ) {}
}

export class Modal {
  public type: InteractionType.Modal = InteractionType.Modal
  constructor(
    public customId: string | string[],
    public execute: BaseInteractionFunction<ModalSubmitInteraction<'cached'>>
  ) {}
}

export class AutoComplete {
  public type: InteractionType.AutoComplete = InteractionType.AutoComplete
  constructor(
    public customId: string | string[],
    public execute: BaseInteractionFunction<AutocompleteInteraction<'cached'>>
  ) {}
}

export type BaseInteraction =
  | Button
  | SelectMenu
  | ContextMenu
  | Modal
  | AutoComplete
export type InteractionData = RESTPostAPIApplicationCommandsJSONBody
export type BaseInteractionFunction<T = Interaction> = (
  client: BotClient,
  interaction: T
) => Promise<any>
