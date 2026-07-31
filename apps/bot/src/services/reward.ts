/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 보상 지급(돈·경험치·자재)과 레벨업은
 * 퀘스트 수령·수확·건설이 모두 지나는 단일 경로라, 웹이 같은 코드를 실행하지
 * 않으면 두 표면의 지급 결과가 어긋난다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export { RewardService } from '@idle/game-services'
export type { GrantedReward, GrantResult } from '@idle/game-services'
