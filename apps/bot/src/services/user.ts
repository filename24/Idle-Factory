import type { PrismaClient } from '@idle/database'
import { generateSlotTypes } from '@idle/game-core'
import { runInTx, type Tx } from './base'

export interface EnsureUserInput {
  readonly discordId: string
  readonly nickname?: string
  readonly lang?: string
}

const LAND_WIDTH = 3
const LAND_HEIGHT = 3
const DEFAULT_WAREHOUSE_GRADE = 1

async function createLandWithSlots(tx: Tx, userId: string): Promise<void> {
  const land = await tx.land.create({
    data: {
      userId,
      width: LAND_WIDTH,
      height: LAND_HEIGHT
    }
  })

  const grid = generateSlotTypes({ width: LAND_WIDTH, height: LAND_HEIGHT })

  const slotsData = grid.flatMap((row, y) =>
    row.map((type, x) => ({
      landId: land.id,
      x,
      y,
      type
    }))
  )

  await tx.slot.createMany({ data: slotsData })
}

async function createWarehouse(tx: Tx, userId: string): Promise<void> {
  await tx.warehouse.create({
    data: {
      userId,
      grade: DEFAULT_WAREHOUSE_GRADE
    }
  })
}

async function findHydratedUser(tx: Tx, discordId: string) {
  return tx.user.findUniqueOrThrow({
    where: { id: discordId },
    include: {
      land: { include: { slots: true } },
      warehouse: true
    }
  })
}

export type HydratedUser = Awaited<ReturnType<typeof findHydratedUser>>

export const UserService = {
  /**
   * Idempotently ensure a User, their Land (3×3 with generated special slots),
   * and Warehouse (grade 1) exist. Safe to call repeatedly — returns the
   * hydrated User on every call.
   */
  async ensure(
    prisma: PrismaClient,
    input: EnsureUserInput
  ): Promise<HydratedUser> {
    const { discordId, nickname, lang } = input

    return runInTx(prisma, async (tx) => {
      const existing = await tx.user.findUnique({
        where: { id: discordId },
        select: { id: true }
      })

      if (!existing) {
        await tx.user.create({
          data: {
            id: discordId,
            ...(nickname !== undefined ? { nickname } : {}),
            ...(lang !== undefined ? { lang } : {})
          }
        })
      }

      const hasLand = await tx.land.findUnique({
        where: { userId: discordId },
        select: { id: true }
      })
      if (!hasLand) {
        await createLandWithSlots(tx, discordId)
      }

      const hasWarehouse = await tx.warehouse.findUnique({
        where: { userId: discordId },
        select: { id: true }
      })
      if (!hasWarehouse) {
        await createWarehouse(tx, discordId)
      }

      return findHydratedUser(tx, discordId)
    })
  }
} as const
