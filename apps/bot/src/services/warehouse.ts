import type { PrismaClient } from '@idle/database'
import {
  capacityOf,
  computeFree,
  computeUsed,
  upgradeCostOf,
  type MaterialBag,
  type MaterialType
} from '@idle/game-core'
import { runInTx, ServiceError, type Tx } from './base'

const MAX_GRADE = 10

export interface WarehouseStackView {
  readonly material: MaterialType
  readonly count: bigint
}

export interface WarehouseView {
  readonly grade: number
  readonly capacity: bigint
  readonly used: bigint
  readonly free: bigint
  readonly stacks: readonly WarehouseStackView[]
}

async function loadWarehouse(tx: Tx, userId: string) {
  const wh = await tx.warehouse.findUnique({
    where: { userId },
    include: { stacks: true }
  })
  if (!wh) {
    throw new ServiceError(
      'USER_NOT_FOUND',
      `warehouse for user ${userId} not found`
    )
  }
  return wh
}

function stacksToBag(
  stacks: readonly { material: MaterialType; count: bigint }[]
): MaterialBag {
  const bag: MaterialBag = {}
  for (const s of stacks) {
    bag[s.material] = (bag[s.material] ?? 0n) + s.count
  }
  return bag
}

export const WarehouseService = {
  async view(prisma: PrismaClient, userId: string): Promise<WarehouseView> {
    return runInTx(prisma, async (tx) => {
      const wh = await loadWarehouse(tx, userId)
      const capacity = capacityOf(wh.grade)
      const bag = stacksToBag(wh.stacks)
      const used = computeUsed(bag)
      const free = computeFree(wh.grade, bag)
      const stacks: WarehouseStackView[] = wh.stacks.map((s) => ({
        material: s.material,
        count: s.count
      }))
      return { grade: wh.grade, capacity, used, free, stacks }
    })
  },

  async upgrade(prisma: PrismaClient, userId: string): Promise<WarehouseView> {
    return runInTx(prisma, async (tx) => {
      const wh = await loadWarehouse(tx, userId)

      if (wh.grade >= MAX_GRADE) {
        throw new ServiceError(
          'MAX_GRADE',
          `warehouse already at max grade ${MAX_GRADE}`
        )
      }

      const nextGrade = wh.grade + 1
      const cost = upgradeCostOf(nextGrade)

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { money: true }
      })
      if (!user) {
        throw new ServiceError('USER_NOT_FOUND', `user ${userId} not found`)
      }

      if (user.money < cost.money) {
        throw new ServiceError(
          'INSUFFICIENT_MONEY',
          `need ${cost.money} money to upgrade to grade ${nextGrade}`,
          { required: String(cost.money) }
        )
      }

      const stack = await tx.warehouseStack.findUnique({
        where: {
          warehouseId_material: {
            warehouseId: wh.id,
            material: cost.material
          }
        }
      })
      const owned = stack?.count ?? 0n
      if (owned < cost.amount) {
        throw new ServiceError(
          'INSUFFICIENT_MATERIAL',
          `need ${cost.amount} ${cost.material} to upgrade to grade ${nextGrade}`,
          { material: cost.material, amount: String(cost.amount) }
        )
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost.money } }
      })

      await tx.warehouseStack.update({
        where: {
          warehouseId_material: {
            warehouseId: wh.id,
            material: cost.material
          }
        },
        data: { count: { decrement: cost.amount } }
      })

      await tx.warehouse.update({
        where: { id: wh.id },
        data: { grade: nextGrade }
      })

      const refreshed = await loadWarehouse(tx, userId)
      const bag = stacksToBag(refreshed.stacks)
      return {
        grade: refreshed.grade,
        capacity: capacityOf(refreshed.grade),
        used: computeUsed(bag),
        free: computeFree(refreshed.grade, bag),
        stacks: refreshed.stacks.map((s) => ({
          material: s.material,
          count: s.count
        }))
      }
    })
  }
} as const
