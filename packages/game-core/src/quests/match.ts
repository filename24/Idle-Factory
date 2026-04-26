/**
 * 퀘스트 트리거 매칭.
 *
 * 게임 이벤트(`QuestEvent`) 와 카탈로그 정의(`QuestDef.trigger`) 를 비교해
 * (a) 매칭 여부, (b) 진행도 증가량을 계산한다.
 *
 * 동일 `kind` 끼리만 매칭 가능. 옵션 필드는 모두 AND 로 결합된다(미지정 시 무조건 통과).
 *
 * 순수 함수: 외부 상태 의존 없음. 테스트 100% 적용 대상.
 */

import type { MatchResult, QuestDef, QuestEvent, QuestTrigger } from './types'

const NO_MATCH: MatchResult = Object.freeze({
  matched: false,
  increment: 0n,
})

/**
 * 정의의 트리거가 이벤트에 매칭되는지, 그리고 progress 에 더할 증가량을 반환한다.
 *
 * 반환 규약:
 * - `matched: false` 면 `increment: 0n` 보장.
 * - `MARKET_LISTED` 만 `event.quantity` 를 그대로 increment 로 흘려보내 누적형 확장에 대비.
 *   그 외 이벤트는 1n 단위로 증가.
 *
 * @param def 카탈로그에서 가져온 퀘스트 정의 (또는 직접 만든 `QuestDef`).
 * @param event 게임 서비스에서 발화한 이벤트.
 */
export function matchEvent(def: QuestDef, event: QuestEvent): MatchResult {
  const trigger = def.trigger
  if (trigger.kind !== event.kind) {
    return NO_MATCH
  }

  switch (trigger.kind) {
    case 'FACTORY_BUILT':
      return matchFactoryBuilt(trigger, event as Extract<QuestEvent, { kind: 'FACTORY_BUILT' }>)
    case 'FACTORY_HARVESTED':
      return { matched: true, increment: 1n }
    case 'FACTORY_UPGRADED':
      return matchFactoryUpgraded(
        trigger,
        event as Extract<QuestEvent, { kind: 'FACTORY_UPGRADED' }>,
      )
    case 'MARKET_LISTED':
      return matchMarketListed(trigger, event as Extract<QuestEvent, { kind: 'MARKET_LISTED' }>)
    case 'WAREHOUSE_UPGRADED':
      return matchWarehouseUpgraded(
        trigger,
        event as Extract<QuestEvent, { kind: 'WAREHOUSE_UPGRADED' }>,
      )
  }
}

function matchFactoryBuilt(
  trigger: Extract<QuestTrigger, { kind: 'FACTORY_BUILT' }>,
  event: Extract<QuestEvent, { kind: 'FACTORY_BUILT' }>,
): MatchResult {
  if (trigger.tier !== undefined && trigger.tier !== event.tier) return NO_MATCH
  if (trigger.type !== undefined && trigger.type !== event.type) return NO_MATCH
  if (trigger.minTotal !== undefined && BigInt(event.ownedAfter) < trigger.minTotal) return NO_MATCH
  return { matched: true, increment: 1n }
}

function matchFactoryUpgraded(
  trigger: Extract<QuestTrigger, { kind: 'FACTORY_UPGRADED' }>,
  event: Extract<QuestEvent, { kind: 'FACTORY_UPGRADED' }>,
): MatchResult {
  if (trigger.minToGrade !== undefined && event.toGrade < trigger.minToGrade) return NO_MATCH
  return { matched: true, increment: 1n }
}

function matchMarketListed(
  trigger: Extract<QuestTrigger, { kind: 'MARKET_LISTED' }>,
  event: Extract<QuestEvent, { kind: 'MARKET_LISTED' }>,
): MatchResult {
  if (trigger.material !== undefined && trigger.material !== event.material) return NO_MATCH
  return { matched: true, increment: event.quantity }
}

function matchWarehouseUpgraded(
  trigger: Extract<QuestTrigger, { kind: 'WAREHOUSE_UPGRADED' }>,
  event: Extract<QuestEvent, { kind: 'WAREHOUSE_UPGRADED' }>,
): MatchResult {
  if (trigger.minToGrade !== undefined && event.toGrade < trigger.minToGrade) return NO_MATCH
  return { matched: true, increment: 1n }
}
