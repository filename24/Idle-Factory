import 'dotenv/config'
import '@sapphire/plugin-i18next/register'
import '@sapphire/plugin-scheduled-tasks/register'
import Logger from '@utils/Logger'
import config from './config'
import BotClient from '@structures/BotClient'
import { registerGracefulShutdown } from '@utils/shutdown'
import { createAuditWebhookSender } from '@utils/adminAuditWebhook'
import { AdminService } from './services'

const logger = new Logger('main')

logger.log('Starting up...')

// 운영 감사 웹후크 주입 (#21 결정 6). 서비스 계층이 config·fetch 를 직접 붙들지
// 않게 부팅 시 1회만 꽂는다 — 통합 테스트는 이 경로를 타지 않으므로 외부 호출이
// 발생하지 않는다.
AdminService.setAuditWebhook(
  createAuditWebhookSender(config.admin.auditWebhookUrl)
)
if (!config.admin.auditWebhookUrl) {
  logger.warn(
    'ADMIN_AUDIT_WEBHOOK_URL 미설정 — /admin 감사 로그는 DB 에만 기록됩니다.'
  )
}

process.on('uncaughtException', (e) => logger.error(e.stack as string))
process.on('unhandledRejection', (e: Error) => logger.error(e.stack as string))

const client = new BotClient(config.bot.options)
registerGracefulShutdown(client)
await client.login(config.bot.token)
