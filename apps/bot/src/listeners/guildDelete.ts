/**
 * 봇이 길드에서 퇴장(또는 추방) 됐을 때 호출되는 리스너.
 *
 * `Guild.leftAt` 를 set 해 docs/07 §비활성 서버 풀 의 30일 경과 분배 로직 트리거를 살린다.
 * row 가 없으면 (등록 안 된 길드) no-op.
 *
 * 참조: docs/design/07-server.md §비활성 서버 풀
 */

import { Listener, Events } from '@sapphire/framework'
import type { Guild } from 'discord.js'
import Logger from '@utils/Logger'
import { GuildService } from '../services/guild'

const logger = new Logger('guildDelete')

export class GuildDeleteListener extends Listener<typeof Events.GuildDelete> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.GuildDelete })
  }

  public async run(guild: Guild) {
    try {
      await GuildService.markLeft(this.container.db, guild.id)
      logger.info(`Marked guild ${guild.id} as left`)
    } catch (err) {
      logger.error(`Failed to mark guild ${guild.id} as left: ${String(err)}`)
    }
  }
}
