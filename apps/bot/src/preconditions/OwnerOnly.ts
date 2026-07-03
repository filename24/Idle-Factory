/**
 * 봇 관리자(owner)만 명령을 실행할 수 있게 제한하는 precondition.
 *
 * owner 목록은 `BotClient.dokdo.owners`(Dokdo 가 해석한 최종 owner 배열)를 단일
 * 출처로 사용한다. Dokdo 는 `config.bot.owners`(`BOT_OWNERS` env)로 초기화하되,
 * 그 값이 비어 있으면 `ready` 시점에 `application.fetch()` 로 Discord 애플리케이션
 * 소유자(단독 owner) 또는 팀 멤버 전원을 자동으로 채운다. 따라서 `BOT_OWNERS` 를
 * 설정하지 않아도 앱 소유자는 항상 owner 로 인정되며, Dokdo 디버그 콘솔과 이
 * precondition 이 완전히 동일한 owner 기준을 공유한다.
 *
 * 비-owner 에게는 `context: { silent: true }` 로 조용히 실패시켜 명령 존재 자체를
 * 노출하지 않는다. (자동완성/명령 목록에는 보일 수 있으므로, 민감한 명령은
 * 개발 길드(`config.devGuildID`) 한정 등록과 함께 사용하는 것을 권장한다.)
 *
 * 참조:
 *  - https://sapphirejs.dev/docs/Guide/preconditions/creating-your-own-preconditions
 *  - dokdo@1.1.0 `Dokdo.owners` (ready 시 앱 소유자/팀 자동 해석)
 */

import { Precondition } from '@sapphire/framework'
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandInteraction,
  Message
} from 'discord.js'
import type BotClient from '@structures/BotClient'

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
   * 호출자 id 가 Dokdo 가 해석한 owner 목록에 포함되면 통과, 아니면 silent 실패.
   */
  private checkOwner(userId: string) {
    const owners = (this.container.client as BotClient).dokdo.owners
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
