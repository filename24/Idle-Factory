/**
 * 퀘스트 카탈로그. 코드가 단일 진실 소스이며 마이그레이션 없이 추가/수정 가능하다.
 *
 * 정의 변경이 진행 중인 유저에게 영향 주지 않도록, `UserQuest.target` 과
 * `UserQuest.rewardSnapshot` 컬럼이 시드 시점 카탈로그를 박아둔다(스냅샷).
 *
 * 튜토리얼 퀘스트는 docs/design/00-onboarding.md §튜토리얼 퀘스트 체인 의 5단계 체인을 따른다.
 * 각 i18n 키는 `apps/bot/src/locales/{ko,en-US}/game.json` 의 `quest.tutorial.<n>` 에 매핑된다.
 */

import type { QuestDef } from './types'

/**
 * 전체 퀘스트 카탈로그.
 *
 * 새 퀘스트 추가 시:
 * 1. 여기 객체 리터럴에 entry 추가.
 * 2. i18n 파일 (`apps/bot/src/locales/<lng>/game.json`) 에 title/description 키 추가.
 * 3. 필요한 경우 `match.ts` 에 새 `QuestTrigger.kind` 분기 + 게임 서비스에 발화처 추가.
 *
 * `Object.freeze` 로 런타임 불변. 시퀀셜 체인은 각 정의의 `chain.next` 포인터로 표현.
 */
export const QUEST_CATALOG: Readonly<Record<string, QuestDef>> = Object.freeze({
  // ── 튜토리얼 체인 (docs/design/00-onboarding.md §튜토리얼 퀘스트 체인) ──
  'tutorial.1': {
    id: 'tutorial.1',
    kind: 'TUTORIAL',
    chain: { name: 'tutorial', order: 1, next: 'tutorial.2' },
    title: 'game:quest.tutorial.1.title',
    description: 'game:quest.tutorial.1.description',
    target: 1n,
    rewards: [{ kind: 'MONEY', amount: 1_000n }],
    trigger: { kind: 'FACTORY_BUILT', tier: 'T1' },
  },
  'tutorial.2': {
    id: 'tutorial.2',
    kind: 'TUTORIAL',
    chain: { name: 'tutorial', order: 2, next: 'tutorial.3' },
    title: 'game:quest.tutorial.2.title',
    description: 'game:quest.tutorial.2.description',
    target: 1n,
    rewards: [{ kind: 'MONEY', amount: 500n }],
    trigger: { kind: 'FACTORY_HARVESTED' },
  },
  'tutorial.3': {
    id: 'tutorial.3',
    kind: 'TUTORIAL',
    chain: { name: 'tutorial', order: 3, next: 'tutorial.4' },
    title: 'game:quest.tutorial.3.title',
    description: 'game:quest.tutorial.3.description',
    target: 1n,
    rewards: [{ kind: 'MONEY', amount: 500n }],
    trigger: { kind: 'MARKET_LISTED' },
  },
  'tutorial.4': {
    id: 'tutorial.4',
    kind: 'TUTORIAL',
    chain: { name: 'tutorial', order: 4, next: 'tutorial.5' },
    title: 'game:quest.tutorial.4.title',
    description: 'game:quest.tutorial.4.description',
    target: 1n,
    rewards: [{ kind: 'MONEY', amount: 2_000n }],
    trigger: { kind: 'FACTORY_UPGRADED', minToGrade: 2 },
  },
  'tutorial.5': {
    id: 'tutorial.5',
    kind: 'TUTORIAL',
    chain: { name: 'tutorial', order: 5 }, // 체인 종착 — next 없음
    title: 'game:quest.tutorial.5.title',
    description: 'game:quest.tutorial.5.description',
    target: 2n,
    rewards: [{ kind: 'MONEY', amount: 1_000n }],
    trigger: { kind: 'FACTORY_BUILT', tier: 'T1', minTotal: 2n },
  },
})

/**
 * 카탈로그에서 questId 로 정의를 조회한다.
 * 존재하지 않으면 `null` 반환 — 호출자가 처리.
 */
export function getQuestDef(questId: string): QuestDef | null {
  return QUEST_CATALOG[questId] ?? null
}
