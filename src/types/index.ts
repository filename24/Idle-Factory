import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ClientOptions,
  ContextMenuCommandInteraction,
  HexColorString,
  Message,
  ModalSubmitInteraction,
  SelectMenuInteraction,
  ShardingManagerOptions
} from 'discord.js'
import { ReportType } from '@utils/Constants'
import { InitOptions } from 'i18next'
export interface ErrorReportOptions {
  executer?:
    | Message<true>
    | ChatInputCommandInteraction<'cached'>
    | ContextMenuCommandInteraction<'cached'>
    | SelectMenuInteraction<'cached'>
    | ButtonInteraction<'cached'>
    | ModalSubmitInteraction<'cached'>
    | undefined
  isSend?: boolean
}

export type IConfig = {
  BUILD_VERSION: string
  BUILD_NUMBER: string
  devGuildID: string
  name: string
  githubToken?: string
  repository?: string
} & { logger: LoggerConfig } & { bot: BotConfig } & {
  report: ErrorReportConfig
} & { i18n: i18nConfig }

export interface i18nConfig {
  options: InitOptions
}

export interface LoggerConfig {
  level: LevelType
  dev: boolean
}

export interface ErrorReportConfig {
  type: ReportType
  webhook: {
    url: string
  }
  text: {
    guildID: string
    channelID: string
  }
}

export interface BotConfig {
  sharding: boolean
  shardingOptions?: ShardingManagerOptions
  options: ClientOptions
  token: string
  owners?: string[]
  prefix: string
  cooldown?: number
}

export type LevelType =
  | 'fatal'
  | 'error'
  | 'warn'
  | 'info'
  | 'verbose'
  | 'debug'
  | 'chat'

export type EmbedType =
  | 'default'
  | 'error'
  | 'success'
  | 'warn'
  | 'info'
  | HexColorString

export * from './command'
