/**
 * 운영 감사 로그 디스코드 웹후크 전송자 (#21 결정 6).
 *
 * `AdminAuditLog` 가 진실원이고 이 웹후크는 **가시성 보조 수단**이다 — 운영자가
 * DB 를 열지 않고도 "누가 방금 뭘 바꿨는지" 알 수 있게 한다. 따라서 전송 실패가
 * 조작을 되돌리지는 않으며, 실패는 로그로만 남긴다.
 *
 * 채널 웹후크(운영자가 디스코드 UI 로 만든 것)는 애플리케이션 소유가 아니므로
 * 비대화형 컴포넌트를 보내려면 `withComponents: true` 가 필요하다
 * (discord.js `WebhookMessageCreateOptions`). Container/TextDisplay 는 모두
 * 비대화형이라 이 옵션만으로 충분하고, 규약대로 Components v2 로만 구성한다.
 *
 * 이 파일은 store 디렉터리(`commands/`, `listeners/`, `interaction-handlers/`)가
 * 아닌 `utils/` 에 있다 — Sapphire 가 store 하위 모든 파일을 piece 로 로드하려
 * 하기 때문이다 (`apps/bot/AGENTS.md` §Conventions).
 */

import { WebhookClient, MessageFlags } from 'discord.js'
import { simpleContainer, V2_ACCENT } from './ComponentsV2'
import Logger from './Logger'
import type { AdminAuditAction, AuditWebhookSender } from '../services/admin'

const logger = new Logger('AdminAudit')

/** 행위별 표시 문구와 accent 색상. */
const ACTION_META: Readonly<
  Record<AdminAuditAction, { readonly label: string; readonly accent: number }>
> = {
  CREDIT_SET: { label: '신뢰도 설정', accent: V2_ACCENT.warn },
  CREDIT_ADJUST: { label: '신뢰도 조정', accent: V2_ACCENT.warn },
  // 유저 자산에 직접 개입하는 유일한 행위 — 색으로도 구분한다.
  LISTING_REMOVE: { label: '매물 강제 회수', accent: V2_ACCENT.error }
}

/**
 * 감사 웹후크 전송자를 만든다.
 *
 * @param url 웹후크 URL. 비어 있으면 `null` (전송 비활성)
 * @returns 전송자 또는 null
 */
export function createAuditWebhookSender(
  url: string
): AuditWebhookSender | null {
  if (!url) return null

  const client = new WebhookClient({ url })

  return async (payload) => {
    const meta = ACTION_META[payload.action]
    const lines = [
      `**실행자:** <@${payload.actorId}> \`${payload.actorId}\``,
      payload.targetGuildId
        ? `**대상 서버:** \`${payload.targetGuildId}\``
        : null,
      payload.targetId ? `**대상 ID:** \`${payload.targetId}\`` : null,
      payload.beforeValue !== null && payload.beforeValue !== undefined
        ? `**변경:** ${payload.beforeValue} → **${payload.afterValue ?? '—'}**`
        : null,
      payload.reason ? `**사유:** ${payload.reason}` : '**사유:** _미기재_'
    ].filter((line): line is string => line !== null)

    const container = simpleContainer(
      meta.accent,
      meta.label,
      lines.join('\n'),
      `감사 로그 \`${payload.logId}\``
    )

    try {
      await client.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
        // 채널 웹후크는 애플리케이션 소유가 아니라 이 옵션 없이는 비대화형
        // 컴포넌트가 거부된다. 앱 소유 웹후크에서는 무시된다.
        withComponents: true
      })
    } catch (error) {
      // 알림 실패가 조작을 되돌려서는 안 된다 — 기록은 이미 DB 에 커밋됐다.
      logger.error(
        `감사 웹후크 전송 실패 (log ${payload.logId}): ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }
}
