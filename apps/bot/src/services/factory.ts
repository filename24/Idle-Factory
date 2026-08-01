/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 공장 건설·업그레이드·철거는 웹에서도
 * 같은 트랜잭션을 실행해야 하므로 공용 패키지에 있어야 한다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export { DEFAULT_LAND_INDEX, FactoryService } from '@idle/game-services'
export type {
  ApplyRawBoosterParams,
  BuildParams,
  ChooseBoosterParams,
  DestroyParams,
  DestroyResult,
  FactoryInfoDTO,
  SetModeParams,
  UpgradeParams
} from '@idle/game-services'
