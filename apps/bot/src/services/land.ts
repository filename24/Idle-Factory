/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 토지 구매·슬롯 확장·공장 이전은
 * 웹에서도 동일하게 실행되어야 한다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export {
  LandService,
  MAX_LANDS,
  MAX_BUYABLE_INDEX,
  MIN_BUYABLE_INDEX,
  landCost
} from '@idle/game-services'
export type {
  BuyLandInput,
  BuyLandResult,
  ExpandSlotInput,
  ExpandSlotResult,
  MoveFactoryInput,
  MoveFactoryResult
} from '@idle/game-services'
