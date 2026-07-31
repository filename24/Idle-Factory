/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 퀘스트 진행도 갱신과 보상 수령은
 * 봇 인터랙션과 웹 Server Action 이 동일하게 실행해야 하는 트랜잭션이다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export { QuestService, TUTORIAL_ENTRY_QUEST_ID } from '@idle/game-services'
export type { QuestProgressResult, QuestClaimResult } from '@idle/game-services'
