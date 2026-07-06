/**
 * 글로벌 이벤트 서버 공지 전송 서비스.
 *
 * 각 서버의 `Guild.announceChannelId` 로 Components v2 페이로드를 전송하는 단일
 * 진입점이다. 주간 신뢰도 정산·긴급 지원금·비활성 자산 재분배·미납 패널티 등
 * 스케줄 잡과 `/debug run-scheduler` 수동 실행이 공유한다.
 *
 * **잡을 죽이지 않는다**: 클라이언트 미가용(테스트/부팅 전)·채널 미설정·채널
 * 없음·전송 불가(권한/타입)·전송 예외 등 어떤 실패도 throw 하지 않고 조용히
 * 건너뛴다. 공지는 부가 효과이지 정산 자체의 일부가 아니기 때문이다.
 *
 * 근거: docs/design/07-global-system.md §신뢰도 변동·§비활성 서버 자산 분배.
 */

import { container } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ContainerBuilder } from 'discord.js'
import type { TFunction } from 'i18next'

import { v2MessageOptions } from '../utils/ComponentsV2'

/**
 * 공지 페이로드 빌더 — 대상 길드의 로케일 `t` 를 받아 Components v2 컨테이너
 * 배열을 만든다. 호출자가 메시지 문구·구성을 결정한다.
 */
export type AnnounceBuilder = (t: TFunction) => ContainerBuilder[]

/** 여러 길드에 동시(순차) 공지할 항목. */
export interface AnnounceItem {
  readonly guildId: string
  readonly build: AnnounceBuilder
}

export const AnnounceService = {
  /**
   * 단일 길드의 공지 채널로 Components v2 메시지를 전송한다.
   *
   * 다음의 경우 전송하지 않고 `false` 를 반환한다(예외 없음):
   *  - 클라이언트 미가용(부팅 전·유닛/통합 테스트 환경)
   *  - `Guild.announceChannelId` 미설정
   *  - 채널을 찾을 수 없음
   *  - 전송 불가 채널(권한 없음·타입 불가)이거나 DM 채널
   *  - 전송 중 예외 발생(경고 로깅 후 스킵)
   *
   * @param guildId 대상 서버(Discord snowflake)
   * @param build   대상 서버 로케일 `t` 로 Components v2 컨테이너를 만드는 빌더
   * @returns 실제 전송 성공 여부
   */
  async announce(guildId: string, build: AnnounceBuilder): Promise<boolean> {
    // 클라이언트 가드가 가장 먼저 — 테스트/부팅 전에는 DB 조회조차 하지 않는다.
    const client = container.client
    if (!client) return false

    const row = await container.db.guild.findUnique({
      where: { id: guildId },
      select: { announceChannelId: true }
    })
    const channelId = row?.announceChannelId
    if (!channelId) return false

    let channel
    try {
      channel = await client.channels.fetch(channelId)
    } catch {
      return false
    }
    // 전송 가능한 서버 텍스트 채널만 허용(DM·전송 불가 채널 제외).
    if (!channel || !channel.isSendable() || channel.isDMBased()) return false

    try {
      const t = await fetchT(channel.guild)
      await channel.send(v2MessageOptions(build(t)))
      return true
    } catch (err) {
      container.logger?.warn(
        `[announce] send failed (guild=${guildId}, channel=${channelId}): ${
          err instanceof Error ? err.message : String(err)
        }`
      )
      return false
    }
  },

  /**
   * 여러 길드에 각자의 페이로드를 순차 전송하고 성공 건수를 반환한다.
   *
   * 개별 실패는 서로를 막지 않는다(각 `announce` 가 독립적으로 no-op/스킵).
   *
   * @returns 실제 전송에 성공한 길드 수
   */
  async announceMany(items: ReadonlyArray<AnnounceItem>): Promise<number> {
    let sent = 0
    for (const item of items) {
      if (await this.announce(item.guildId, item.build)) sent += 1
    }
    return sent
  }
} as const
