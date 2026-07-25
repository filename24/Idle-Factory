/**
 * `@idle/game-core` 배럴 엔트리.
 *
 * Idle-Factory의 순수 도메인 로직(공장/창고/토지/경험치)을 한 곳에서 재export한다.
 * 런타임 의존성이 없으므로 bot/web 어느 쪽에서도 사용 가능하다.
 *
 * 참조: `docs/design/01-overview.md` ~ `docs/design/11-land.md`
 */

export * from './version'
export * from './types'
export * from './factories/booster'
export * from './factories/catalog'
export * from './factories/cost'
export * from './factories/production'
export * from './warehouse/capacity'
export * from './land/expansion'
export * from './land/layout'
export * from './land/specialSlots'
export * from './land/synergy'
export * from './market/basePrices'
export * from './market/price'
export * from './stock/price'
export * from './stock/listing'
export * from './stock/holding'
export * from './economy/assets'
export * from './economy/directBuy'
export * from './economy/kst'
export * from './economy/tax'
export * from './xp/level'
export * from './credit/credit'
export * from './quests'
export * from './simulation'
