import { container } from '@sapphire/framework'
import { Guild, WebhookClient, type Interaction } from 'discord.js'
import Embed from '@utils/Embed'
import Logger from '@utils/Logger'
import { v4 } from 'uuid'
import { ErrorReportOptions } from '@types'
import { ReportType } from '@utils/Constants'
import config from '../config'

export default class ErrorManager {
  private logger = new Logger('bot')

  public report(error: Error, options?: ErrorReportOptions) {
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

    if (options?.isSend && options.executer) {
      const executer = options.executer as Interaction
      if ('reply' in executer && typeof executer.reply === 'function') {
        ;(executer as any).reply({ embeds: [errorEmbed] }).catch(() => null)
      }
    }

    if (config.report.type === ReportType.Webhook) {
      const webhook = new WebhookClient({ url: config.report.webhook.url })
      webhook.send(errorText)
    } else if (config.report.type === ReportType.Text) {
      const guild = container.client.guilds.cache.get(
        config.report.text.guildID
      ) as Guild
      const channel = guild.channels.cache.get(config.report.text.channelID)
      if (channel?.isTextBased()) channel.send(errorText)
    }
  }
}
