/**
 * 봇 ready 시점에 보이는 길드 목록과 DB 상태를 동기화하는 리스너.
 *
 * 다운타임 중 발생한 GuildCreate/GuildDelete 이벤트는 봇이 받지 못하므로,
 * ClientReady 직후 reconciliation 으로 누락/잔재 row 를 정리한다.
 *
 * 샤딩 모드일 땐 다른 샤드가 보유한 길드를 "left" 로 잘못 판정할 수 있어
 * `detectLeft: false` 로 left 검출만 스킵 (create/rejoin/rename 은 그대로 수행).
 *
 * 참조: docs/design/07-server.md §비활성 서버 풀
 */

import { Listener, Events } from '@sapphire/framework'
import type { Client } from 'discord.js'
import Logger from '@utils/Logger'
import { GuildService } from '../services/guild'

const logger = new Logger('guildReconcile')

export class GuildReconcileListener extends Listener<
  typeof Events.ClientReady
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ClientReady, once: true })
  }

  public async run(client: Client<true>) {
    const visible = client.guilds.cache.map((g) => ({ id: g.id, name: g.name }))
    // ShardClientUtil 가 존재하면 샤딩 모드 — 다른 샤드 보유 길드를 left 로 단정 불가.
    const detectLeft = client.shard === null

    try {
      const result = await GuildService.reconcileGuilds(
        this.container.db,
        visible,
        { detectLeft }
      )
      const summary = `created=${result.created}, rejoined=${result.rejoined}, renamed=${result.renamed}, left=${result.left}`
      const note = detectLeft ? '' : ' (sharded — left detection skipped)'
      logger.info(
        `Reconciled ${visible.length} visible guilds: ${summary}${note}`
      )
    } catch (err) {
      logger.error(`Guild reconciliation failed: ${String(err)}`)
    }
  }
}
