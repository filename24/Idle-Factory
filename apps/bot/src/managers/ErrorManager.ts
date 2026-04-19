import { container } from '@sapphire/framework'
import { WebhookClient } from 'discord.js'
import Embed from '@utils/Embed'
import Logger from '@utils/Logger'
import { v4 } from 'uuid'
import { ErrorReportOptions } from '@types'
import { ReportType } from '@utils/Constants'
import config from '../config'

export default class ErrorManager {
  private logger = new Logger('bot')

  public async report(error: Error, options?: ErrorReportOptions) {
    this.logger.error(error.stack as string)

    const date = (Number(new Date()) / 1000) | 0
    const errorText = `**[<t:${date}:T> ERROR]** ${error.stack}`
    const errorCode = v4()

    const errorEmbed = new Embed(container.client, 'error')
      .setTitle('오류가 발생했습니다.')
      .setDescription(
        '명령어 실행 도중에 오류가 발생하였습니다. 개발자에게 오류코드를 보내 개발에 지원해주세요.'
      )
      .addFields([{ name: '오류 코드', value: errorCode, inline: true }])

    const executer = options?.executer
    if (options?.isSend && executer) {
      const payload = { embeds: [errorEmbed] }
      if ('author' in executer) {
        await executer.reply(payload).catch(() => null)
      } else {
        await executer.reply(payload).catch(() => null)
      }
    }

    if (config.report.type === ReportType.Webhook) {
      if (!config.report.webhook.url) return
      const webhook = new WebhookClient({ url: config.report.webhook.url })
      await webhook.send(errorText).catch((err) => {
        this.logger.error(`Failed to send webhook error report: ${err}`)
      })
    } else if (config.report.type === ReportType.Text) {
      const guild = container.client.guilds.cache.get(
        config.report.text.guildID
      )
      const channel = guild?.channels.cache.get(config.report.text.channelID)
      if (channel?.isTextBased()) {
        await channel.send(errorText).catch((err) => {
          this.logger.error(`Failed to send text error report: ${err}`)
        })
      }
    }
  }
}
