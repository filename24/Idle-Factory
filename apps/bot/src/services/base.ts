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
 */

export * from '@idle/game-services'
