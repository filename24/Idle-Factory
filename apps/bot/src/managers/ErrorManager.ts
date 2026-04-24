import { container } from '@sapphire/framework'
import { WebhookClient } from 'discord.js'
import Logger from '@utils/Logger'
import {
  simpleContainer,
  v2Flags,
  v2MessageOptions,
  V2_ACCENT
} from '@utils/ComponentsV2'
import { v4 } from 'uuid'
import { ErrorReportOptions } from '@types'
import { ReportType } from '@utils/Constants'
import config from '../config'

export default class ErrorManager {
  private logger = new Logger('bot')

  public async report(error: Error, options?: ErrorReportOptions) {
    this.logger.error(error.stack as string)

    const date = (Number(new Date()) / 1000) | 0
    const errorCode = v4()
    const errorSummary = `${error.name}: ${error.message}`
    const errorText = `**[<t:${date}:T> ERROR]** \`${errorCode}\` — ${errorSummary}`

    const errorContainer = simpleContainer(
      V2_ACCENT.error,
      '오류가 발생했습니다.',
      [
        '명령어 실행 도중에 오류가 발생하였습니다. 개발자에게 오류코드를 보내 개발에 지원해주세요.',
        '',
        `**오류 코드:** \`${errorCode}\``
      ].join('\n'),
      `<t:${date}:T>`
    )

    const executer = options?.executer
    if (options?.isSend && executer) {
      const payload = {
        components: [errorContainer],
        flags: v2Flags(false)
      }
      if ('author' in executer) {
        await executer.reply(payload).catch(() => null)
      } else {
        await executer.reply(payload).catch(() => null)
      }
    }

    const reportContainer = simpleContainer(V2_ACCENT.error, 'ERROR', errorText)
    const reportPayload = v2MessageOptions([reportContainer])

    if (config.report.type === ReportType.Webhook) {
      if (!config.report.webhook.url) return
      const webhook = new WebhookClient({ url: config.report.webhook.url })
      await webhook.send(reportPayload).catch((err) => {
        this.logger.error(`Failed to send webhook error report: ${err}`)
      })
    } else if (config.report.type === ReportType.Text) {
      const guild = container.client.guilds.cache.get(
        config.report.text.guildID
      )
      const channel = guild?.channels.cache.get(config.report.text.channelID)
      if (channel?.isTextBased() && 'send' in channel) {
        await channel.send(reportPayload).catch((err) => {
          this.logger.error(`Failed to send text error report: ${err}`)
        })
      }
    }
  }
}
