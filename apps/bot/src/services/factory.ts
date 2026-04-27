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
import { QuestService } from './quest'

const MAX_GRADE = 10

export const DEFAULT_LAND_INDEX = 1

export interface BuildParams {
  readonly userId: string
  readonly type: FactoryType
  readonly anchorX: number
  readonly anchorY: number
  readonly landIndex?: number
}

export interface DestroyParams {
  readonly userId: string
  readonly factoryId: string
}

export interface DestroyResult {
  readonly landIndex: number
  readonly type: FactoryType
  readonly refund: bigint
  readonly remainingMoney: bigint
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

async function ensureLandWithSlots(tx: Tx, userId: string, landIndex: number) {
  const land = await tx.land.findUnique({
    where: { userId_index: { userId, index: landIndex } },
    include: { slots: true }
  })
  if (!land) throw new ServiceError('LAND_NOT_FOUND')
  return land
}

export const FactoryService = {
  async build(prisma: PrismaClient, params: BuildParams) {
    const {
      userId,
      type,
      anchorX,
      anchorY,
      landIndex = DEFAULT_LAND_INDEX
    } = params
    const entry = FACTORY_CATALOG[type]
    const cost = buildCost(type)

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new ServiceError('USER_NOT_FOUND')
      if (user.level < entry.unlockLevel) {
        throw new ServiceError('LEVEL_LOCKED')
      }
      if (user.money < cost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: cost.toString(),
          have: user.money.toString()
        })
      }

      const land = await ensureLandWithSlots(tx, userId, landIndex)
      const slotStates: SlotState[] = land.slots.map((s) => ({
        x: s.x,
        y: s.y,
        type: s.type,
        factoryId: s.factoryId,
        locked: s.locked
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
          case 'LOCKED':
            throw new ServiceError('SLOT_LOCKED')
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

      // 빌드 완료 직후 같은 트랜잭션 안에서 퀘스트 진행도 갱신.
      // ownedAfter 는 같은 tier 누적 보유 수 (Q5 minTotal 매칭에 사용).
      const ownedAfter = await tx.factory.count({
        where: { userId, tier: entry.tier }
      })
      const quest = await QuestService.progress(tx, userId, {
        kind: 'FACTORY_BUILT',
        tier: entry.tier,
        type,
        ownedAfter
      })

      return { factory, quest }
    })
  },

  async destroy(
    prisma: PrismaClient,
    params: DestroyParams
  ): Promise<DestroyResult> {
    const { userId, factoryId } = params
    return runInTx(prisma, async (tx) => {
      const factory = await tx.factory.findUnique({ where: { id: factoryId } })
      if (!factory || factory.userId !== userId)
        throw new ServiceError('FACTORY_NOT_FOUND')

      const slot = await tx.slot.findFirst({
        where: { factoryId },
        select: { land: { select: { index: true } } }
      })
      const landIndex = slot?.land?.index ?? DEFAULT_LAND_INDEX

      await tx.slot.updateMany({
        where: { factoryId },
        data: { factoryId: null }
      })
      await tx.factory.delete({ where: { id: factoryId } })

      const refund = buildCost(factory.type) / 2n
      const updated = await tx.user.update({
        where: { id: userId },
        data: { money: { increment: refund } }
      })

      return {
        landIndex,
        type: factory.type,
        refund,
        remainingMoney: updated.money
      }
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
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: money.toString(),
          have: user.money.toString()
        })
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
      const quest = await QuestService.progress(tx, userId, {
        kind: 'FACTORY_UPGRADED',
        fromGrade: factory.grade,
        toGrade: updated.grade,
        type: factory.type
      })
      return { factory: updated, quest }
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
  }
}
