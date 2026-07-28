/**
 * ClientReady 시점에 BullMQ 반복 작업을 등록한다.
 *
 * 플러그인은 ScheduledTask piece 를 store 에 싣기만 하고 스케줄은 잡아 주지
 * 않는다. 근거와 주의사항은 `utils/registerRepeatedTasks.ts` 주석 참고.
 *
 * ClientReady 를 고른 이유: store 로드가 `login()` 안에서 끝나므로 이 시점엔
 * 모든 ScheduledTask 가 들어와 있고, Redis 연결도 클라이언트 생성 시 준비된다.
 */

import { Listener, Events } from '@sapphire/framework'
import type { Client } from 'discord.js'
import Logger from '@utils/Logger'
import { registerRepeatedTasks } from '@utils/registerRepeatedTasks'

const logger = new Logger('ScheduledTasks')

export class ScheduledTaskRegistrarListener extends Listener<
  typeof Events.ClientReady
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ClientReady, once: true })
  }

  public async run(_client: Client<true>) {
    const store = this.container.stores.get('scheduled-tasks')

    await registerRepeatedTasks({
      repeatedCount: store.repeatedTasks.length,
      createRepeated: () => this.container.tasks.createRepeated(),
      logger
    })
  }
}
