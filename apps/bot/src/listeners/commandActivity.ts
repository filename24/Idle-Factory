/**
 * 슬래시 커맨드 성공 시 서버×유저 일간 활동을 기록하는 리스너 (#16).
 *
 * `Guild.weeklyDAU` 집계(주간 정산 잡)와 #17 신뢰도 공식의 원천 데이터를
 * 선행 축적한다 (docs/design/07-global-system.md §신뢰도 변동 — 활성도 기반).
 *
 * 부담 최소화 원칙:
 *  - 서버(길드) 컨텍스트가 있는 실행만 기록 — DM 은 서버 활동이 아니다.
 *  - `createMany + skipDuplicates` 단일 INSERT — 같은 날 재실행은 no-op.
 *  - 기록 실패는 삼키고 경고 로그만 남긴다 — 통계 적재가 커맨드 UX 를
 *    깨선 안 된다 (버튼/셀렉트 인터랙션은 v1 스코프 밖).
 */

import { Events, Listener } from '@sapphire/framework'
import type { ChatInputCommandSuccessPayload } from '@sapphire/framework'
import Logger from '@utils/Logger'
import { GuildActivityService } from '../services/guildActivity'

const logger = new Logger('commandActivity')

export class CommandActivityListener extends Listener<
  typeof Events.ChatInputCommandSuccess
> {
  public constructor(
    context: Listener.LoaderContext,
    options: Listener.Options
  ) {
    super(context, { ...options, event: Events.ChatInputCommandSuccess })
  }

  public async run(payload: ChatInputCommandSuccessPayload): Promise<void> {
    const { interaction } = payload
    if (!interaction.guildId) return

    try {
      await GuildActivityService.recordDailyActivity(this.container.db, {
        guildId: interaction.guildId,
        userId: interaction.user.id
      })
    } catch (err) {
      // 통계 적재 실패는 비치명 — 커맨드 흐름을 깨지 않고 관측만 남긴다.
      logger.warn(
        `daily activity upsert failed (guild=${interaction.guildId}, user=${interaction.user.id}): ${String(err)}`
      )
    }
  }
}
