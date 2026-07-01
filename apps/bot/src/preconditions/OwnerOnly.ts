/**
 * 봇 관리자(owner)만 명령을 실행할 수 있게 제한하는 precondition.
 *
 * owner 목록은 `BOT_OWNERS` env → `config.bot.owners` → SapphireClient 의
 * `options.owners` 로 전달된 값을 그대로 사용한다. 별도 저장소 없이 클라이언트
 * 옵션 하나만 참조하므로 디버그/운영 명령에 `preconditions: ['OwnerOnly']` 로
 * 부착하면 즉시 게이팅된다.
 *
 * 비-owner 에게는 `context: { silent: true }` 로 조용히 실패시켜 명령 존재 자체를
 * 노출하지 않는다. (자동완성/명령 목록에는 보일 수 있으므로, 민감한 명령은
 * 개발 길드(`config.devGuildID`) 한정 등록과 함께 사용하는 것을 권장한다.)
 *
 * 참조: https://sapphirejs.dev/docs/Guide/preconditions/creating-your-own-preconditions
 */

import { Precondition } from '@sapphire/framework'
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message
} from 'discord.js'
import config from '../config'

/** 비-owner 실패를 식별하는 precondition identifier. */
export const OWNER_ONLY_IDENTIFIER = 'OwnerOnly'

export class OwnerOnlyPrecondition extends Precondition {
  /** 슬래시 명령. */
  public override chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.checkOwner(interaction.user.id)
  }

  /** 컨텍스트 메뉴 명령. */
  public override contextMenuRun(interaction: ContextMenuCommandInteraction) {
    return this.checkOwner(interaction.user.id)
  }

  /** 레거시 prefix 명령(현 봇은 미사용). */
  public override messageRun(message: Message) {
    return this.checkOwner(message.author.id)
  }

  /**
   * 호출자 id 가 클라이언트 owner 목록에 포함되면 통과, 아니면 silent 실패.
   */
  private checkOwner(userId: string) {
    const owners = config.bot.owners ?? []
    return owners.includes(userId)
      ? this.ok()
      : this.error({
          identifier: OWNER_ONLY_IDENTIFIER,
          message: '이 명령은 봇 관리자만 사용할 수 있어요.',
          context: { silent: true }
        })
  }
}

declare module '@sapphire/framework' {
  interface Preconditions {
    OwnerOnly: never
  }
}
