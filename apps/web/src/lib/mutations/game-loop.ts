import { FACTORY_CATALOG, LAND_MAX_HEIGHT, LAND_MAX_WIDTH, type FactoryType } from '@idle/game-core'
import { FactoryService, HarvestService, LandService } from '@idle/game-services'
import { resolveActiveGuildId } from '../active-guild'
import { defineGameMutation } from '../mutation'

/**
 * 핵심 게임 루프 뮤테이션 — 수확 · 건설 · 업그레이드 · 철거 · 이전 · 토지/슬롯.
 *
 * 전부 `@idle/game-services` 의 서비스를 그대로 호출한다. 웹에서 경제 계산을
 * 다시 구현하지 않는 것이 이 파일의 존재 이유다 — 봇과 웹이 같은 트랜잭션을
 * 실행해야 결과가 어긋나지 않는다.
 *
 * 소유권은 두 겹으로 막힌다:
 *  1. `defineGameMutation` 의 `ownership` — 트랜잭션 열기 전 빠른 실패.
 *  2. 서비스 내부의 `userId` 대조 — 트랜잭션 안의 권위 있는 검사.
 * 2번을 "가드가 이미 했으니" 이유로 제거하면 안 된다.
 */

/** 토지 좌표 범위 검증. */
function assertCoordinate(value: unknown, max: number, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= max) {
    throw new Error(`${label} 는 0 이상 ${max} 미만 정수여야 한다`)
  }
  return value
}

/** 토지 번호 검증. 실제 보유 여부는 서비스가 판정한다. */
function assertLandIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error('landIndex 는 1..5 정수여야 한다')
  }
  return value
}

/** cuid 형태의 id 검증 — 길이만 본다(형식 검사는 DB 조회가 대신한다). */
function assertId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) {
    throw new Error(`${label} 가 올바르지 않다`)
  }
  return value
}

/** 원시 입력에서 필드를 꺼낸다. FormData 와 평범한 객체를 모두 받는다. */
function field(raw: unknown, name: string): unknown {
  if (raw instanceof FormData) {
    const value = raw.get(name)
    return value === null ? undefined : value
  }
  return (raw as Record<string, unknown> | null)?.[name]
}

/** FormData 로 온 숫자 문자열을 숫자로 바꾼다. */
function numberField(raw: unknown, name: string): unknown {
  const value = field(raw, name)
  return typeof value === 'string' && value.trim() !== '' ? Number(value) : value
}

// ─────────────────────────── 수확 ───────────────────────────

/**
 * 전체 공장 일괄 수확.
 *
 * 입력이 없으므로 파서는 통과만 시킨다. 레이트 리밋을 다른 뮤테이션보다 짧게
 * 잡는 이유는, 경과 tick 이 0이면 no-op 이라 연타해도 이득이 없지만 매번
 * Serializable 트랜잭션을 열기 때문이다.
 */
export const harvestAll = defineGameMutation({
  name: 'harvest.all',
  parse: () => ({}),
  rateLimit: { limit: 12, windowMs: 60_000 },
  revalidate: ['/dashboard/me'],
  run: (ctx) => HarvestService.harvestAll(ctx.db, ctx.session.gameUserId),
})

/** 단일 공장 수확. */
export const harvestOne = defineGameMutation({
  name: 'harvest.one',
  parse: (raw) => ({ factoryId: assertId(field(raw, 'factoryId'), 'factoryId') }),
  rateLimit: { limit: 30, windowMs: 60_000 },
  ownership: (input) => [{ resource: 'factory', id: input.factoryId }],
  revalidate: ['/dashboard/me'],
  run: (ctx, input) =>
    HarvestService.harvestOne(ctx.db, {
      userId: ctx.session.gameUserId,
      factoryId: input.factoryId,
    }),
})

// ─────────────────────────── 공장 ───────────────────────────

/** 공장 건설. */
export const buildFactory = defineGameMutation({
  name: 'factory.build',
  parse: (raw) => {
    const type = field(raw, 'type')
    if (typeof type !== 'string' || !(type in FACTORY_CATALOG)) {
      throw new Error(`알 수 없는 공장 종류: ${String(type)}`)
    }
    return {
      type: type as FactoryType,
      anchorX: assertCoordinate(numberField(raw, 'anchorX'), LAND_MAX_WIDTH, 'anchorX'),
      anchorY: assertCoordinate(numberField(raw, 'anchorY'), LAND_MAX_HEIGHT, 'anchorY'),
      landIndex: assertLandIndex(numberField(raw, 'landIndex')),
    }
  },
  rateLimit: { limit: 20, windowMs: 60_000 },
  revalidate: ['/dashboard/me'],
  run: async (ctx, input) =>
    FactoryService.build(ctx.db, {
      userId: ctx.session.gameUserId,
      type: input.type,
      anchorX: input.anchorX,
      anchorY: input.anchorY,
      landIndex: input.landIndex,
      guildId: await resolveActiveGuildId(ctx.session.gameUserId),
    }),
})

/** 공장 업그레이드. */
export const upgradeFactory = defineGameMutation({
  name: 'factory.upgrade',
  parse: (raw) => ({ factoryId: assertId(field(raw, 'factoryId'), 'factoryId') }),
  rateLimit: { limit: 20, windowMs: 60_000 },
  ownership: (input) => [{ resource: 'factory', id: input.factoryId }],
  revalidate: ['/dashboard/me'],
  run: async (ctx, input) =>
    FactoryService.upgrade(ctx.db, {
      userId: ctx.session.gameUserId,
      factoryId: input.factoryId,
      // 신뢰도가 9·10 등급 해금과 XP 보너스를 좌우한다. null 을 넘기면
      // 웹 유저만 조용히 손해를 보므로 반드시 해석해서 넘긴다.
      guildId: await resolveActiveGuildId(ctx.session.gameUserId),
    }),
})

/** 공장 철거. 상장된 공장은 서비스가 `FACTORY_LISTED` 로 막는다. */
export const destroyFactory = defineGameMutation({
  name: 'factory.destroy',
  parse: (raw) => ({ factoryId: assertId(field(raw, 'factoryId'), 'factoryId') }),
  rateLimit: { limit: 10, windowMs: 60_000 },
  ownership: (input) => [{ resource: 'factory', id: input.factoryId }],
  revalidate: ['/dashboard/me'],
  run: (ctx, input) =>
    FactoryService.destroy(ctx.db, {
      userId: ctx.session.gameUserId,
      factoryId: input.factoryId,
    }),
})

/** 같은 토지 안에서 공장 이전. */
export const moveFactory = defineGameMutation({
  name: 'factory.move',
  parse: (raw) => ({
    factoryId: assertId(field(raw, 'factoryId'), 'factoryId'),
    landIndex: assertLandIndex(numberField(raw, 'landIndex')),
    toX: assertCoordinate(numberField(raw, 'toX'), LAND_MAX_WIDTH, 'toX'),
    toY: assertCoordinate(numberField(raw, 'toY'), LAND_MAX_HEIGHT, 'toY'),
  }),
  rateLimit: { limit: 20, windowMs: 60_000 },
  ownership: (input) => [{ resource: 'factory', id: input.factoryId }],
  revalidate: ['/dashboard/me'],
  run: (ctx, input) =>
    LandService.moveFactory(ctx.db, {
      userId: ctx.session.gameUserId,
      landIndex: input.landIndex,
      factoryId: input.factoryId,
      toX: input.toX,
      toY: input.toY,
    }),
})

// ─────────────────────────── 토지 ───────────────────────────

/** 토지 구매. */
export const buyLand = defineGameMutation({
  name: 'land.buy',
  parse: (raw) => ({ targetIndex: assertLandIndex(numberField(raw, 'targetIndex')) }),
  rateLimit: { limit: 10, windowMs: 60_000 },
  revalidate: ['/dashboard/me'],
  run: (ctx, input) =>
    LandService.buy(ctx.db, {
      userId: ctx.session.gameUserId,
      targetIndex: input.targetIndex,
    }),
})

/** 잠긴 슬롯 확장. */
export const expandSlot = defineGameMutation({
  name: 'land.expand',
  parse: (raw) => ({
    landIndex: assertLandIndex(numberField(raw, 'landIndex')),
    x: assertCoordinate(numberField(raw, 'x'), LAND_MAX_WIDTH, 'x'),
    y: assertCoordinate(numberField(raw, 'y'), LAND_MAX_HEIGHT, 'y'),
  }),
  rateLimit: { limit: 20, windowMs: 60_000 },
  revalidate: ['/dashboard/me'],
  run: (ctx, input) =>
    LandService.expandSlot(ctx.db, {
      userId: ctx.session.gameUserId,
      landIndex: input.landIndex,
      x: input.x,
      y: input.y,
    }),
})
