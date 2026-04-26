/**
 * `@idle/game-core` 배럴 엔트리.
 *
 * Idle-Factory의 순수 도메인 로직(공장/창고/토지/경험치)을 한 곳에서 재export한다.
 * 런타임 의존성이 없으므로 bot/web 어느 쪽에서도 사용 가능하다.
 *
 * 참조: `docs/design/01-overview.md` ~ `docs/design/11-land.md`
 */

/** 패키지 시맨틱 버전. 호환성 깨지는 변경 시에만 메이저를 올린다. */
export const GAME_CORE_VERSION = '1.0.0'

export * from './types'
export * from './factories/catalog'
export * from './factories/cost'
export * from './factories/production'
export * from './warehouse/capacity'
export * from './land/expansion'
export * from './land/layout'
export * from './land/specialSlots'
export * from './land/synergy'
export * from './xp/level'
export * from './quests'
