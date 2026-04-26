/**
 * 퀘스트 알림 헬퍼.
 *
 * 게임 명령 응답에 "🎉 퀘스트 완료" 컨테이너를 덧붙여 즉시 알림 효과를 낸다.
 * 수동 클레임 정책이므로 컨테이너에는 클레임 버튼이 없고 `/quest` 안내만 들어간다.
 *
 * 미래 백그라운드 알림(스케줄러) 위해 `dm` 시그니처도 같이 노출 — 본 PR 에선 호출처 없음.
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import {
  type BaseMessageOptions,
  type Client,
  ContainerBuilder,
  type InteractionReplyOptions,
  type MessageEditOptions,
  MessageFlags
} from 'discord.js'
import type { QuestProgressResult } from '../services/quest'
import {
  buildCompletionContainer,
  buildUnlockedContainer
} from '@structures/renderers'

/** Components v2 한 메시지 컴포넌트 한도(40). 안전 마진 35 로 보호. */
const COMPONENT_BUDGET = 35

type Payload = InteractionReplyOptions | MessageEditOptions | BaseMessageOptions

/**
 * 메인 응답 페이로드의 `components` 배열에 퀘스트 완료 컨테이너를 추가한다.
 *
 * - `newlyCompleted` 가 비어있으면 입력 페이로드 그대로 반환.
 * - 추가할 컨테이너 수가 한도를 초과하면 단일 합본 컨테이너로 fallback.
 *
 * @param payload 게임 명령의 기존 reply 페이로드 (components 보유).
 * @param result `QuestService.progress` 결과.
 * @param t fetchT 결과 — i18n 키 해석.
 */
export function appendQuestCompletions<T extends Payload>(
  payload: T,
  result: QuestProgressResult,
  t: TFunction
): T {
  if (result.newlyCompleted.length === 0) return payload

  const existing = (payload.components ?? []) as ContainerBuilder[]
  const remaining = COMPONENT_BUDGET - existing.length
  const completed = result.newlyCompleted

  let toAdd: ContainerBuilder[]
  if (completed.length > remaining && remaining > 0) {
    // 한도 초과 — 합본 컨테이너 1개로 축약 (게임 응답을 깨트리지 않기 위함).
    const merged = buildCompletionContainer(completed[0]!, t)
    toAdd = [merged]
  } else {
    toAdd = completed.map((row) => buildCompletionContainer(row, t))
  }

  return {
    ...payload,
    components: [...existing, ...toAdd]
  } as T
}

/**
 * 백그라운드 이벤트(스케줄러)에서 발화된 완료 알림을 DM 으로 전송.
 *
 * 본 PR 에선 미사용. DM 차단 등 실패는 swallow + 로그.
 */
export async function dmQuestCompletions(
  client: Client,
  userId: string,
  result: QuestProgressResult,
  t: TFunction
): Promise<void> {
  if (result.newlyCompleted.length === 0) return
  try {
    const user = await client.users.fetch(userId)
    const containers = result.newlyCompleted.map((row) =>
      buildCompletionContainer(row, t)
    )
    await user.send({
      components: containers,
      flags: MessageFlags.IsComponentsV2
    })
  } catch {
    // DM 차단·디스코드 API 실패 — 백그라운드 알림은 best-effort.
  }
}

export { buildCompletionContainer, buildUnlockedContainer }
