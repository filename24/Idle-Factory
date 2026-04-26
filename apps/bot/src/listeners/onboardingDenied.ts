/**
 * Onboarding precondition 이 deny 한 명령을 swallow 하는 리스너.
 *
 * Sapphire 기본 deny 핸들러는 generic 에러 메시지를 응답하지만,
 * 우리는 이미 precondition 이 동의 페이로드로 응답을 보낸 상태이므로
 * `ONBOARDING_DENY_IDENTIFIER` 인 경우엔 후속 응답을 막아야 한다.
 *
 * 다른 식별자의 deny 는 통과시켜 기본 에러 흐름이 동작하도록 둔다.
 */

import {
  Listener,
  Events,
  type ChatInputCommandDeniedPayload,
  type ContextMenuCommandDeniedPayload
} from '@sapphire/framework'
import { ONBOARDING_DENY_IDENTIFIER } from '@utils/Constants'

export class ChatInputOnboardingDeniedListener extends Listener<
  typeof Events.ChatInputCommandDenied
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ChatInputCommandDenied })
  }

  public async run(
    error: { identifier: string; message: string },
    _payload: ChatInputCommandDeniedPayload
  ) {
    if (error.identifier === ONBOARDING_DENY_IDENTIFIER) {
      // precondition 이 이미 동의 페이로드로 응답했으므로 추가 동작 금지.
      return
    }
    // 다른 deny 는 Sapphire 기본 핸들러에 위임 (이 리스너 외 다른 핸들러가 있다면 거기서 처리).
  }
}

export class ContextMenuOnboardingDeniedListener extends Listener<
  typeof Events.ContextMenuCommandDenied
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ContextMenuCommandDenied })
  }

  public async run(
    error: { identifier: string; message: string },
    _payload: ContextMenuCommandDeniedPayload
  ) {
    if (error.identifier === ONBOARDING_DENY_IDENTIFIER) {
      return
    }
  }
}
