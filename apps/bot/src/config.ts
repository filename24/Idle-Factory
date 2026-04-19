import { execSync } from 'child_process'
import { IConfig } from '@types'
import { ReportType } from './utils/Constants'
import { en, ko } from '@locales'
import { IntentsBitField } from 'discord.js'

const env = (key: string, fallback = ''): string => process.env[key] ?? fallback

const requireEnv = (key: string): string => {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

const parseBool = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback
  return value.toLowerCase() === 'true' || value === '1'
}

const parseList = (value: string | undefined): string[] =>
  value
    ? value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
    : []

const getBuildNumber = (): string => {
  if (process.env.BUILD_NUMBER) return process.env.BUILD_NUMBER
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

const reportType =
  env('REPORT_TYPE', 'webhook').toLowerCase() === 'text'
    ? ReportType.Text
    : ReportType.Webhook

const config: IConfig = {
  BUILD_NUMBER: getBuildNumber(),
  BUILD_VERSION: env('BUILD_VERSION', '0.1.4'),
  devGuildID: env('DEV_GUILD_ID'),
  githubToken: env('GITHUB_TOKEN'),
  name: env('BOT_NAME', 'DJS Template'),
  bot: {
    sharding: parseBool(process.env.BOT_SHARDING, false),
    options: {
      intents: [
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.Guilds
      ],
      allowedMentions: { parse: ['users', 'roles'], repliedUser: false }
    },
    token: requireEnv('BOT_TOKEN'),
    owners: parseList(process.env.BOT_OWNERS),
    prefix: env('BOT_PREFIX', '<@786891249005232179> '),
    cooldown: Number(env('BOT_COOLDOWN', '2000')),
    shardingOptions: undefined
  },
  report: {
    type: reportType,
    webhook: {
      url: env('REPORT_WEBHOOK_URL')
    },
    text: {
      guildID: env('REPORT_TEXT_GUILD_ID'),
      channelID: env('REPORT_TEXT_CHANNEL_ID')
    }
  },
  logger: {
    level: env('LOG_LEVEL', 'chat') as IConfig['logger']['level'],
    dev: parseBool(process.env.LOG_DEV, false)
  },
  i18n: {
    options: {
      lng: env('I18N_LNG', 'en'),
      resources: {
        en: {
          translation: en
        },
        ko: {
          translation: ko
        }
      }
    }
  }
}

export default config
