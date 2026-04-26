/**
 * 모든 Command piece 가 로드된 직후 'Onboarding' precondition 을 자동으로 prepend.
 *
 * Sapphire 5 의 `Events.PiecePostLoad` 는 Events 상수에 이름만 등록되어 있고
 * 프레임워크가 실제로는 emit 하지 않아(좀비 이벤트), `ClientReady`(once) 시점에
 * commands store 를 일괄 순회해 preconditions 컨테이너에 'Onboarding' 을 append 한다.
 *
 * SapphireClient 의 `loadAll()` 은 `login()` 안에서 끝나고 `ClientReady` 보다 먼저
 * 완료되므로 이 시점엔 모든 Command piece 가 store 에 들어와 있다.
 *
 * 우회 명령 없음 — 신규 명령을 추가해도 이 패턴이 적용되려면 봇 재시작 1회가 필요하다.
 */

import { Listener, Events, Command } from '@sapphire/framework'
import type { Client } from 'discord.js'
import Logger from '@utils/Logger'

const logger = new Logger('Onboarding')

export class OnboardingPreconditionInjectorListener extends Listener<
  typeof Events.ClientReady
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ClientReady, once: true })
  }

  public run(_client: Client<true>) {
    const commandStore = this.container.stores.get('commands')
    let injected = 0
    for (const piece of commandStore.values()) {
      if (piece instanceof Command) {
        piece.preconditions.append('Onboarding')
        injected += 1
      }
    }
    logger.info(`Injected 'Onboarding' precondition into ${injected} commands`)
  }
}
