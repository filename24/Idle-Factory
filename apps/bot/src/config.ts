import { execSync } from 'child_process'
import { join } from 'path'
import { IConfig } from '@types'
import { ReportType } from './utils/Constants'
import { createLanguageFetcher } from './utils/language'
import { pieceRoot } from './utils/pieceRoot'
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

// BullMQ(scheduled-tasks)·DatabaseClient 가 공유하는 Redis 접속 URL.
// dev 기본값은 docker-compose.dev.yml 의 Redis 7 (호스트 포트 6380).
// 프로덕션은 반드시 REDIS_URL 을 주입해야 한다.
const redisUrl = env('REDIS_URL', 'redis://localhost:6380')

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
      allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
      // @sapphire/plugin-scheduled-tasks 의 BullMQ 큐 Redis 연결.
      // 클라이언트 생성 시점에 큐·워커가 이 연결로 즉시 구성된다.
      tasks: {
        bull: {
          connection: { url: redisUrl }
        }
      }
    },
    token: requireEnv('BOT_TOKEN'),
    owners: parseList(process.env.BOT_OWNERS),
    prefix: env('BOT_PREFIX', ';;'),
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
  redis: {
    url: redisUrl
  },
  admin: {
    // 운영 감사 로그(#21 결정 6)를 흘려보낼 디스코드 채널 웹후크.
    // 비어 있으면 DB 기록만 하고 알림은 보내지 않는다 — 운영 툴 자체는
    // 웹후크 없이도 완전히 동작한다.
    auditWebhookUrl: env('ADMIN_AUDIT_WEBHOOK_URL')
  },
  i18n: {
    options: {
      defaultNS: 'common',
      defaultMissingKey: 'generic',
      // baseUserDirectory 와 같은 이유로 번들 위치에 의존하지 않는다.
      // dev 는 src/locales, 프로덕션은 build/locales(빌드 스크립트가 복사).
      defaultLanguageDirectory: join(pieceRoot, 'locales'),
      // 이 리졸버가 없으면 플러그인 기본값 `() => null` 이 쓰이고, 언어는
      // guild.preferredLocale 로만 정해진다 — DB 의 User.lang / Guild.lang 이
      // 통째로 무시된다.
      fetchLanguage: createLanguageFetcher(),
      i18next: {
        fallbackLng: env('I18N_FALLBACK_LNG', 'en-US'),
        interpolation: {
          escapeValue: false
        }
      }
    }
  }
}

export default config
