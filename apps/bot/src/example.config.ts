import { execSync } from 'child_process'
import { IConfig } from '@types'
import { ReportType } from './utils/Constants'
import { en, ko } from '@locales'
import { IntentsBitField } from 'discord.js'

const config: IConfig = {
  BUILD_NUMBER: execSync('git rev-parse --short HEAD').toString().trim(),
  BUILD_VERSION: '0.1.4',
  devGuildID: '',
  githubToken: '',
  name: 'DJS Template',
  bot: {
    sharding: false,
    options: {
      intents: [
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.Guilds
      ],
      allowedMentions: { parse: ['users', 'roles'], repliedUser: false }
    },
    token: '',
    owners: [],
    prefix: '<@786891249005232179> ',
    cooldown: 2000
  },
  report: {
    type: ReportType.Webhook,
    webhook: {
      url: ''
    },
    text: {
      guildID: '',
      channelID: ''
    }
  },
  logger: {
    level: 'chat',
    dev: false
  },
  i18n: {
    options: {
      lng: 'en',
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
