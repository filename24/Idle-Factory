import { ChatInputCommandInteraction, Interaction, Message } from 'discord.js'
import { i18n, TFunction } from 'i18next'
import BotClient from './BotClient'
import { InteractionData } from './Interaction'

/**
 * @example
 * export default new SlashCommand(
 *    new SlashCommandBuilder()
 *      .setName('ping')
 *      .setDescription('ping, pong').toJSON(),
 *    async (client, interaction) => {
 *      interaction.reply('Pong!')
 *  })
 */
export class SlashCommand {
  slash?: SlashCommand
  constructor(
    public data: InteractionData,
    public execute: SlashCommandFunction,
    public options?: SlashCommandOptions
  ) {}
}

export type SlashCommandFunction = (
  client: BotClient,
  interaction: ChatInputCommandInteraction,
  i18n: TFunction
) => Promise<any>

export interface SlashCommandOptions {
  name: string
  isSlash?: boolean
}

/**
 * @example
 * export default new MessageCommand(
 *  {
 *     name: 'ping',
 *     aliases: ['pong']
 *  },
 *  async (client, message, args) => {
 *    message.reply('Pong!')
 *  }
 * )
 */
export class MessageCommand {
  constructor(
    public data: MessageCommandOptions,
    public execute: MessageCommandFuntion
  ) {}
}

export interface MessageCommandOptions {
  name: string
  description?: string
  aliases: string[]
}

export type MessageCommandFuntion = (
  client: BotClient,
  message: Message<true>,
  i18n: TFunction,
  args: string[]
) => Promise<any> | Promise<any>

/**
 * @example
 * export default new BaseCommand({
 *    name: 'ping',
 *    aliases: ['pong']
 * }, async (client, message, args) => {
 *    message.reply('pong!')
 * }, {
 *    new SlashCommandBuilder()
 *      .setName('ping')
 *      .setDescription('ping, pong').toJSON(),
 *    async (client, interaction) => {
 *      interaction.reply('Pong!')
 *    }
 * })
 */
export class BaseCommand extends MessageCommand {
  constructor(
    public data: MessageCommandOptions,
    public execute: MessageCommandFuntion,
    public slash?: SlashCommand | undefined
  ) {
    super(data, execute)
  }
}

export type Command = MessageCommand | SlashCommand
