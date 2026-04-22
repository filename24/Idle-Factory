import type { FactoryType, ShortageMode } from '@idle/database'
import {
  FACTORY_CATALOG,
  buildCost,
  canPlace,
  getOccupiedCells,
  upgradeMaterialCost,
  upgradeMoneyCost,
  xpForEvent,
  type SlotState
} from '@idle/game-core'
import { PrismaClient } from '@idle/database'
import { ServiceError, Tx, runInTx } from './base'

const MAX_GRADE = 10

/**
 * `/factory build` 기본 토지 번호. 커맨드/핸들러 호출자가 명시하지 않으면
 * 하위호환을 위해 시작 토지(1번)로 해석한다.
 */
export const DEFAULT_LAND_INDEX = 1

/**
 * `FactoryService.build` 입력.
 *
 * `landIndex`는 필수이며, 유저가 보유하지 않은 토지 번호이면 `LAND_NOT_FOUND`를
 * 던진다(서비스는 토지를 암묵적으로 생성하지 않는다 — 토지 생성은
 * `UserService.ensure`(1번) 또는 `LandService.buy`(2~5번)가 담당).
 */
export interface BuildParams {
  readonly userId: string
  readonly landIndex: number
  readonly type: FactoryType
  readonly anchorX: number
  readonly anchorY: number
}

export interface UpgradeParams {
  readonly userId: string
  readonly factoryId: string
}

export interface SetModeParams {
  readonly userId: string
  readonly factoryId: string
  readonly mode: ShortageMode
}

/** `FactoryService.destroy` 입력. */
export interface DestroyParams {
  readonly userId: string
  readonly factoryId: string
}

/**
 * `FactoryService.destroy` 결과.
 *
 * 환불 정책 (docs/design/11-land.md §철거): `buildCost(type) / 2` (BigInt floor)만큼
 * money 환불, 재료/upgrade booster/raw booster는 환불 없음.
 */
export interface DestroyResult {
  readonly factoryId: string
  readonly type: FactoryType
  readonly landIndex: number
  readonly anchorX: number
  readonly anchorY: number
  readonly refund: bigint
  readonly remainingMoney: bigint
}

export interface FactoryInfoDTO {
  readonly id: string
  readonly type: FactoryType
  readonly grade: number
  readonly anchorX: number
  readonly anchorY: number
  readonly width: number
  readonly height: number
  readonly shortageMode: ShortageMode
  readonly nextUpgradeCost: {
    readonly money: bigint | null
    readonly material: { material: string; amount: bigint } | null
  }
  readonly unlockLevel: number
}

/**
 * 유저가 소유한 `landIndex` 번 토지를 슬롯 포함으로 로드한다.
 *
 * 서비스는 토지를 암묵적으로 생성하지 않는다. 없으면 `LAND_NOT_FOUND` 에러.
 * (토지 생성 책임은 `UserService.ensure`(1번) 또는 `LandService.buy`(2~5번).)
 */
async function loadLandOrThrow(tx: Tx, userId: string, landIndex: number) {
  const land = await tx.land.findUnique({
    where: { userId_index: { userId, index: landIndex } },
    include: { slots: true }
  })
  if (!land) {
    throw new ServiceError(
      'LAND_NOT_FOUND',
      `user ${userId} does not own land index ${landIndex}`
    )
  }
  return land
}

export const FactoryService = {
  async build(prisma: PrismaClient, params: BuildParams) {
    const { userId, landIndex, type, anchorX, anchorY } = params
    const entry = FACTORY_CATALOG[type]
    const cost = buildCost(type)

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      if (user.level < entry.unlockLevel) {
        throw new ServiceError('LEVEL_LOCKED', undefined, {
          level: entry.unlockLevel
        })
      }
      if (user.money < cost) {
        throw new ServiceError('INSUFFICIENT_MONEY')
      }

      const land = await loadLandOrThrow(tx, userId, landIndex)
      const slotStates: SlotState[] = land.slots.map((s) => ({
        x: s.x,
        y: s.y,
        type: s.type,
        factoryId: s.factoryId
      }))

      const placement = canPlace({
        landWidth: land.width,
        landHeight: land.height,
        slots: slotStates,
        type,
        anchorX,
        anchorY
      })
      if (!placement.ok) {
        switch (placement.reason) {
          case 'OUT_OF_BOUNDS':
            throw new ServiceError('OUT_OF_BOUNDS')
          case 'OCCUPIED':
          case 'OVERLAP':
          default:
            throw new ServiceError('SLOT_OCCUPIED')
        }
      }

      if (entry.buildMaterialCost) {
        const { material, amount } = entry.buildMaterialCost
        const warehouse = await tx.warehouse.findUnique({
          where: { userId }
        })
        if (!warehouse) {
          throw new ServiceError('INSUFFICIENT_MATERIAL', undefined, {
            material,
            amount
          })
        }
        const stack = await tx.warehouseStack.findUnique({
          where: {
            warehouseId_material: {
              warehouseId: warehouse.id,
              material
            }
          }
        })
        if (!stack || stack.count < amount) {
          throw new ServiceError('INSUFFICIENT_MATERIAL', undefined, {
            material,
            amount
          })
        }
        await tx.warehouseStack.update({
          where: { id: stack.id },
          data: { count: { decrement: amount } }
        })
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost } }
      })

      const cells = getOccupiedCells(
        anchorX,
        anchorY,
        entry.size.width,
        entry.size.height
      )

      const factory = await tx.factory.create({
        data: {
          userId,
          landId: land.id,
          type,
          tier: entry.tier,
          grade: 1,
          anchorX,
          anchorY,
          width: entry.size.width,
          height: entry.size.height
        }
      })

      await tx.slot.updateMany({
        where: {
          landId: land.id,
          OR: cells.map((c) => ({ x: c.x, y: c.y }))
        },
        data: { factoryId: factory.id }
      })

      return factory
    })
  },

  async upgrade(prisma: PrismaClient, params: UpgradeParams) {
    const { userId, factoryId } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }
      if (factory.grade >= MAX_GRADE) {
        throw new ServiceError('MAX_GRADE')
      }

      const money = upgradeMoneyCost(factory.type, factory.grade)
      const mat = upgradeMaterialCost(factory.type, factory.grade)

      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      if (user.money < money) {
        throw new ServiceError('INSUFFICIENT_MONEY')
      }

      const warehouse = await tx.warehouse.findUnique({
        where: { userId }
      })
      if (!warehouse) throw new ServiceError('INSUFFICIENT_MATERIAL')
      const stack = await tx.warehouseStack.findUnique({
        where: {
          warehouseId_material: {
            warehouseId: warehouse.id,
            material: mat.material
          }
        }
      })
      if (!stack || stack.count < mat.amount) {
        throw new ServiceError('INSUFFICIENT_MATERIAL')
      }

      await tx.warehouseStack.update({
        where: { id: stack.id },
        data: { count: { decrement: mat.amount } }
      })

      const xp = xpForEvent({ kind: 'UPGRADE', cost: money })

      await tx.user.update({
        where: { id: userId },
        data: {
          money: { decrement: money },
          xp: { increment: xp }
        }
      })

      const updated = await tx.factory.update({
        where: { id: factoryId },
        data: { grade: { increment: 1 } }
      })
      return updated
    })
  },

  async info(prisma: PrismaClient, factoryId: string): Promise<FactoryInfoDTO> {
    const factory = await prisma.factory.findUnique({
      where: { id: factoryId }
    })
    if (!factory) throw new ServiceError('FACTORY_NOT_FOUND')
    const entry = FACTORY_CATALOG[factory.type]
    const canUpgrade = factory.grade < MAX_GRADE
    return {
      id: factory.id,
      type: factory.type,
      grade: factory.grade,
      anchorX: factory.anchorX,
      anchorY: factory.anchorY,
      width: factory.width,
      height: factory.height,
      shortageMode: factory.shortageMode,
      unlockLevel: entry.unlockLevel,
      nextUpgradeCost: canUpgrade
        ? {
            money: upgradeMoneyCost(factory.type, factory.grade),
            material: upgradeMaterialCost(factory.type, factory.grade)
          }
        : { money: null, material: null }
    }
  },

  async setMode(prisma: PrismaClient, params: SetModeParams) {
    const { userId, factoryId, mode } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }
      return tx.factory.update({
        where: { id: factoryId },
        data: { shortageMode: mode }
      })
    })
  },

  /**
   * 공장 철거. 환불 정책은 `docs/design/11-land.md §철거`:
   * - money 환불: `buildCost(type) / 2n` (BigInt floor)
   * - 재료 환불: 없음
   * - upgrade booster / raw booster: 상실 (factory row와 함께 삭제)
   *
   * 슬롯은 `factoryId: null`로 해제되어 재건설 가능. Factory row는 삭제되며,
   * Worker의 `factoryId`는 schema의 `onDelete: SetNull`에 의해 null 처리된다.
   */
  async destroy(
    prisma: PrismaClient,
    params: DestroyParams
  ): Promise<DestroyResult> {
    const { userId, factoryId } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({
        where: { id: factoryId },
        include: { land: { select: { index: true } } }
      })
      if (!factory || factory.userId !== userId) {
        throw new ServiceError('FACTORY_NOT_FOUND')
      }

      const refund = buildCost(factory.type) / 2n

      await tx.slot.updateMany({
        where: { factoryId },
        data: { factoryId: null }
      })
      await tx.factory.delete({ where: { id: factoryId } })

      const updated = await tx.user.update({
        where: { id: userId },
        data: { money: { increment: refund } },
        select: { money: true }
      })

      return {
        factoryId,
        type: factory.type,
        landIndex: factory.land.index,
        anchorX: factory.anchorX,
        anchorY: factory.anchorY,
        refund,
        remainingMoney: updated.money
      }
    })
  }
}
