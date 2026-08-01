import type { FactoryType, PrismaClient } from '@idle/database'
import {
  canPlace,
  getOccupiedCells,
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  landExpansionCost,
  landExpansionLevelRequirement,
  moveCost,
  type SlotState,
} from '@idle/game-core'
import { runInTx, ServiceError, type Tx } from './base'
import { createLandWithSlots } from './user'

/** 유저가 보유 가능한 최대 토지 수 (docs/design/11-land.md). */
export const MAX_LANDS = 5
/** 구매 가능한 토지 index 최솟값 (1번은 신규 가입 시 무상 지급). */
export const MIN_BUYABLE_INDEX = 2
/** 구매 가능한 토지 index 최댓값. */
export const MAX_BUYABLE_INDEX = MAX_LANDS
/** 2번째 토지 기준 단가 (docs/design/11-land.md). */
const BASE_LAND_COST = 1_000_000n

/**
 * N번째 토지 구매 비용 = `1,000,000 × 10^(N-2)` (docs/design/11-land.md).
 *
 * - N=2: 1,000,000
 * - N=3: 10,000,000
 * - N=4: 100,000,000
 * - N=5: 1,000,000,000
 */
export function landCost(targetIndex: number): bigint {
  return BASE_LAND_COST * 10n ** BigInt(targetIndex - MIN_BUYABLE_INDEX)
}

/** `/land buy` 입력값. */
export interface BuyLandInput {
  readonly userId: string
  readonly targetIndex: number
}

/** `/land buy` 성공 응답 — 새로 생성된 토지 요약. */
export interface BuyLandResult {
  readonly targetIndex: number
  readonly cost: bigint
  readonly remainingMoney: bigint
  readonly totalLands: number
}

async function loadUserMoney(tx: Tx, userId: string): Promise<bigint> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { money: true },
  })
  if (!user) {
    throw new ServiceError('USER_NOT_FOUND', `user ${userId} not found`)
  }
  return user.money
}

export const LandService = {
  /**
   * N번째 토지를 구매한다 (N은 2..5).
   *
   * 검증 순서:
   * 1. `targetIndex`가 유효 범위(2..5) 내인지
   * 2. 유저가 이미 최대(5개) 토지 보유 중인지
   * 3. 기존 토지 개수가 정확히 `targetIndex - 1`개인지 (index 연속성)
   * 4. 해당 `targetIndex`가 중복 생성되는지 (race 방어)
   * 5. 보유 자금이 비용 이상인지
   *
   * 성공 시 자금을 차감하고 `createLandWithSlots`로 4×4 그리드를 생성한다.
   * 특수 슬롯은 토지마다 독립적으로 재추첨된다 (docs/design/11-land.md).
   */
  async buy(prisma: PrismaClient, input: BuyLandInput): Promise<BuyLandResult> {
    const { userId, targetIndex } = input

    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < MIN_BUYABLE_INDEX ||
      targetIndex > MAX_BUYABLE_INDEX
    ) {
      throw new ServiceError(
        'INVALID_LAND_INDEX',
        `targetIndex must be integer in [${MIN_BUYABLE_INDEX}, ${MAX_BUYABLE_INDEX}], got ${targetIndex}`,
      )
    }

    return runInTx(prisma, async (tx) => {
      const existingCount = await tx.land.count({ where: { userId } })

      if (existingCount >= MAX_LANDS) {
        throw new ServiceError(
          'MAX_LANDS',
          `user ${userId} already owns ${existingCount} lands (max ${MAX_LANDS})`,
        )
      }

      if (existingCount !== targetIndex - 1) {
        throw new ServiceError(
          'INVALID_LAND_INDEX',
          `cannot buy index ${targetIndex}: user has ${existingCount} lands (expected ${targetIndex - 1})`,
        )
      }

      const duplicate = await tx.land.findUnique({
        where: { userId_index: { userId, index: targetIndex } },
        select: { id: true },
      })
      if (duplicate) {
        throw new ServiceError(
          'LAND_ALREADY_EXISTS',
          `land index ${targetIndex} already exists for user ${userId}`,
        )
      }

      const cost = landCost(targetIndex)
      const money = await loadUserMoney(tx, userId)
      if (money < cost) {
        throw new ServiceError(
          'INSUFFICIENT_MONEY',
          `need ${cost} money to buy land ${targetIndex}, have ${money}`,
        )
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost } },
      })

      await createLandWithSlots(tx, userId, targetIndex)

      return {
        targetIndex,
        cost,
        remainingMoney: money - cost,
        totalLands: existingCount + 1,
      }
    })
  },

  /**
   * 잠긴 슬롯 `(x, y)` 하나를 구매해 활성화한다 (docs/11-land.md §슬롯 확장).
   *
   * 검증 순서:
   *  1. 좌표가 4×4 물리 범위 내인지
   *  2. 해당 토지 존재 + 호출자 소유
   *  3. 해당 슬롯이 `locked=true` 인지 (이미 풀린 슬롯 재구매 방어)
   *  4. 현재 구역의 k번째 구매가 7 이하인지
   *  5. 유저 레벨이 `expansionLevelRequirement(landIndex, k)` 이상인지
   *  6. 자금이 `expansionCost(landIndex, k)` 이상인지
   *
   * 성공 시:
   *  - 유저 자금 차감
   *  - 슬롯 `locked=false`
   *  - 활성 영역이 커진 만큼 `Land.width/height` 갱신 (bounding box)
   *
   * @returns 구매 결과 요약
   */
  async expandSlot(prisma: PrismaClient, input: ExpandSlotInput): Promise<ExpandSlotResult> {
    const { userId, landIndex, x, y } = input

    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= LAND_MAX_WIDTH ||
      y >= LAND_MAX_HEIGHT
    ) {
      throw new ServiceError(
        'OUT_OF_BOUNDS',
        `slot (${x}, ${y}) outside ${LAND_MAX_WIDTH}×${LAND_MAX_HEIGHT} grid`,
      )
    }

    return runInTx(prisma, async (tx) => {
      const land = await tx.land.findUnique({
        where: { userId_index: { userId, index: landIndex } },
        include: { slots: true },
      })
      if (!land) {
        throw new ServiceError('LAND_NOT_FOUND')
      }

      const slot = land.slots.find((s) => s.x === x && s.y === y)
      if (!slot) {
        throw new ServiceError('OUT_OF_BOUNDS')
      }
      if (!slot.locked) {
        throw new ServiceError('SLOT_ALREADY_UNLOCKED')
      }

      // 현재 구역에서 이미 풀린 확장 슬롯 수(= k-1) → 이번이 k번째.
      // "확장 슬롯"은 초기 3×3 영역 밖(x=3 또는 y=3)에서 locked=false 인 슬롯 수로 센다.
      const alreadyExpanded = land.slots.filter((s) => (s.x >= 3 || s.y >= 3) && !s.locked).length
      const order = alreadyExpanded + 1
      if (order < 1 || order > 7) {
        throw new ServiceError('INVALID_LAND_INDEX')
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { level: true, money: true },
      })
      if (!user) throw new ServiceError('USER_NOT_FOUND')

      const requiredLevel = landExpansionLevelRequirement(landIndex, order)
      if (user.level < requiredLevel) {
        throw new ServiceError('LEVEL_LOCKED', undefined, {
          level: requiredLevel,
        })
      }

      const cost = landExpansionCost(landIndex, order)
      if (user.money < cost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: cost.toString(),
          have: user.money.toString(),
        })
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost } },
      })
      await tx.slot.update({
        where: { id: slot.id },
        data: { locked: false },
      })

      // Land.width/height 는 4×4 구조 크기로 고정 — 활성 영역은 Slot.locked 가 결정.
      // 이전 모델은 활성 bounding box 로 width 를 갱신했지만, 단순성을 위해 구조 크기로 통일.

      return {
        landIndex,
        x,
        y,
        order,
        cost,
        remainingMoney: user.money - cost,
      }
    })
  },

  /**
   * 공장 1개를 **같은 토지 구역 내** 다른 위치로 이동한다 (docs/design/11-land.md §공장 이동).
   *
   * 설계 확정 사항:
   * - **비용 = 해당 공장 신축비의 25%** (`moveCost`, docs/11-land.md §공장 이동 · 철거 표).
   * - **구역 간 이동 불가** — 목적지는 대상 공장이 이미 속한 토지(`landId`) 내부로만 제한한다.
   *   (구역 간 이동은 설계 미정이므로 같은 `landId` 로 한정. docs/11-land.md §공장 이동 "같은 토지 구역 내 빈 슬롯으로만".)
   * - **등급·내용물·생산 연속성 유지** — 앵커 좌표만 갱신하고 `lastHarvestAt` 은 건드리지 않는다.
   *   (docs/11-land.md §공장 이동 "등급·내용물 유지". tick 누적이 초기화되지 않도록 '유지'로 확정.)
   * - **시너지·특수 슬롯 보너스는 수확 시 재계산** — `harvest.ts` 가 매 수확마다 현재 좌표·슬롯으로
   *   `computeLandSynergies` / `getSpecialSlotBonus` 를 다시 계산하므로 이동 후 별도 갱신이 필요 없다.
   *
   * 검증 순서:
   *  1. 목적지 좌표가 4×4 물리 범위 내 정수인지
   *  2. 대상 토지 존재 + 호출자 소유
   *  3. 대상 공장 존재 + 호출자 소유 + 이 토지 소속(구역 간 이동 차단)
   *  4. 목적지가 현재 위치와 다른지 (`MOVE_SAME_POSITION`)
   *  5. 자기 자신 점유 셀을 비운 가상 상태에서 배치 가능한지 (T3 2×2 전체 경계·잠금·점유 검증)
   *  6. 자금이 이동 비용 이상인지
   *
   * 성공 시: 자금 차감 → 기존 점유 셀 해제 → 목적지 셀 점유(T3 는 4셀 동반) → 공장 앵커 갱신.
   *
   * @returns 이동 결과 요약
   */
  async moveFactory(prisma: PrismaClient, input: MoveFactoryInput): Promise<MoveFactoryResult> {
    const { userId, landIndex, factoryId, toX, toY } = input

    if (
      !Number.isInteger(toX) ||
      !Number.isInteger(toY) ||
      toX < 0 ||
      toY < 0 ||
      toX >= LAND_MAX_WIDTH ||
      toY >= LAND_MAX_HEIGHT
    ) {
      throw new ServiceError(
        'OUT_OF_BOUNDS',
        `destination (${toX}, ${toY}) outside ${LAND_MAX_WIDTH}×${LAND_MAX_HEIGHT} grid`,
      )
    }

    return runInTx(prisma, async (tx) => {
      const land = await tx.land.findUnique({
        where: { userId_index: { userId, index: landIndex } },
        include: { slots: true },
      })
      if (!land) throw new ServiceError('LAND_NOT_FOUND')

      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      // 존재하지 않거나 남의 공장이면 이동 불가. 창고 등 공장이 아닌 대상도 여기서 걸러진다.
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }
      // 구역 간 이동 차단 — 대상 공장은 반드시 이 토지에 속해야 한다.
      if (factory.landId !== land.id) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }

      const fromX = factory.anchorX
      const fromY = factory.anchorY
      if (toX === fromX && toY === fromY) {
        throw new ServiceError('MOVE_SAME_POSITION')
      }

      // 이동 대상 공장이 지금 점유한 셀을 비운 가상 슬롯 상태로 배치 검증.
      // (T3 를 자기 자리와 겹치는 위치로 밀어 넣는 경우도 자기 점유는 장애물이 아니어야 함.)
      const virtualSlots: SlotState[] = land.slots.map((s) => ({
        x: s.x,
        y: s.y,
        type: s.type,
        locked: s.locked,
        factoryId: s.factoryId === factoryId ? null : s.factoryId,
      }))

      const placement = canPlace({
        landWidth: land.width,
        landHeight: land.height,
        slots: virtualSlots,
        type: factory.type,
        anchorX: toX,
        anchorY: toY,
      })
      if (!placement.ok) {
        switch (placement.reason) {
          case 'OUT_OF_BOUNDS':
            throw new ServiceError('OUT_OF_BOUNDS')
          case 'LOCKED':
            throw new ServiceError('SLOT_LOCKED')
          case 'OCCUPIED':
          case 'OVERLAP':
          default:
            throw new ServiceError('SLOT_OCCUPIED')
        }
      }

      const cost = moveCost(factory.type)
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { money: true },
      })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      if (user.money < cost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: cost.toString(),
          have: user.money.toString(),
        })
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost } },
      })

      // 기존 점유 셀 전부 해제 후 목적지 셀 점유. factoryId 기준으로 지워 데이터 드리프트에도 견고.
      await tx.slot.updateMany({
        where: { landId: land.id, factoryId },
        data: { factoryId: null },
      })
      const newCells = getOccupiedCells(toX, toY, factory.width, factory.height)
      await tx.slot.updateMany({
        where: {
          landId: land.id,
          OR: newCells.map((c) => ({ x: c.x, y: c.y })),
        },
        data: { factoryId },
      })

      // 앵커 좌표만 갱신 — lastHarvestAt 은 유지(생산 연속성).
      await tx.factory.update({
        where: { id: factoryId },
        data: { anchorX: toX, anchorY: toY },
      })

      return {
        landIndex,
        factoryId,
        type: factory.type,
        fromX,
        fromY,
        toX,
        toY,
        cost,
        remainingMoney: user.money - cost,
      }
    })
  },
} as const

/** `/land expand` 입력. */
export interface ExpandSlotInput {
  readonly userId: string
  readonly landIndex: number
  readonly x: number
  readonly y: number
}

/** `/land expand` 성공 결과. */
export interface ExpandSlotResult {
  readonly landIndex: number
  readonly x: number
  readonly y: number
  readonly order: number
  readonly cost: bigint
  readonly remainingMoney: bigint
}

/** `/land move` 입력 — 이동할 공장과 목적지 앵커 좌표. */
export interface MoveFactoryInput {
  readonly userId: string
  /** 대상 공장이 속한 토지 번호 (구역 간 이동 차단에 사용). */
  readonly landIndex: number
  readonly factoryId: string
  /** 목적지 앵커 X (0-based, 좌상단). */
  readonly toX: number
  /** 목적지 앵커 Y (0-based, 좌상단). */
  readonly toY: number
}

/** `/land move` 성공 결과 — 이동 전/후 좌표와 비용. */
export interface MoveFactoryResult {
  readonly landIndex: number
  readonly factoryId: string
  readonly type: FactoryType
  readonly fromX: number
  readonly fromY: number
  readonly toX: number
  readonly toY: number
  readonly cost: bigint
  readonly remainingMoney: bigint
}
