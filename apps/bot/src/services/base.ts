/**
 * 하위 호환 재export 셸.
 *
 * 실제 구현은 `@idle/game-services` 로 이관됐다. 웹(`apps/web`)도 동일한
 * 트랜잭션·에러 코드를 써야 하는데, 봇 내부 경로(`apps/bot/src/services`)는
 * 웹에서 import 할 수 없기 때문이다.
 *
 * 이 셸을 남기는 이유는 `./base` 를 import 하는 봇 파일이 20곳 가까이 되기
 * 때문이다. 한 번에 모두 고치면 diff 가 순수 이동이 아니게 되어 회귀 검토가
 * 어려워진다. 신규 코드는 `@idle/game-services` 에서 직접 import 할 것.
 *
 * **`export *` 를 쓰지 않는다.** 패키지가 커지면서 `UserService` 처럼 봇이
 * 자체 확장한 심볼과 이름이 겹치고, `services/index.ts` 의 배럴에서
 * "already exported a member" 로 깨진다. 이 파일이 원래 담당하던 심볼만
 * 명시적으로 내보낸다.
 */

export { ServiceError, isUniqueViolation, runInTx } from '@idle/game-services'
export type { ServiceErrorCode, Tx } from '@idle/game-services'
