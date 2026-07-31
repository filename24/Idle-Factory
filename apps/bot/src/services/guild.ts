/**
 * 하위 호환 재export 셸.
 *
 * 구현은 `@idle/game-services` 로 이관됐다. 서버 언어·가산세 변경은 웹 관리자
 * 콘솔에서도 같은 검증(0~0.2 클램프, 지원 로케일 화이트리스트)을 거쳐야 한다.
 *
 * 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 */

export { DEFAULT_TAX_SURCHARGE, GuildService } from '@idle/game-services'
export type {
  CreditEffects,
  UpsertOnJoinInput,
  WeeklyCreditChange,
  WeeklyCreditResult
} from '@idle/game-services'
