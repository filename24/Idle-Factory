import {
  AnySelectMenuInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ClientOptions,
  ContextMenuCommandInteraction,
  HexColorString,
  Message,
  ModalSubmitInteraction,
  ShardingManagerOptions
} from 'discord.js'
import { ReportType } from '@utils/Constants'
import { InternationalizationOptions } from '@sapphire/plugin-i18next'

declare module '@sapphire/pieces' {
  interface Container {
    db: import('@idle/database').DatabaseClient
  }
}

export interface ErrorReportOptions {
  executer?:
    | Message<true>
    | ChatInputCommandInteraction<'cached'>
    | ContextMenuCommandInteraction<'cached'>
    | AnySelectMenuInteraction<'cached'>
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
} & { i18n: i18nConfig } & { redis: RedisConfig }

/**
 * Redis 접속 설정.
 *
 * scheduled-tasks(BullMQ) 큐와 DatabaseClient 캐시가 공유하는 접속 정보.
 */
export interface RedisConfig {
  /** Redis 접속 URL (예: `redis://localhost:6380`). */
  url: string
}

export interface i18nConfig {
  options: InternationalizationOptions
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
