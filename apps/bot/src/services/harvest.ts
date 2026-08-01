/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 수확은 창고 클램프·특수 슬롯·인접
 * 시너지·희귀 드롭·퀘스트 진행·상장 수익 적립이 한 트랜잭션에서 얽히는 경로라,
 * 웹에서 재구현하면 두 표면의 결과가 반드시 어긋난다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export { HarvestService } from '@idle/game-services'
export type {
  FactoryHarvestSummary,
  HarvestAllResult,
  StockProfitAccrual
} from '@idle/game-services'
