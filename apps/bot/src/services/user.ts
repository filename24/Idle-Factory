import type { PrismaClient } from '@idle/database'
import { generateSlotTypes } from '@idle/game-core'
import { runInTx, type Tx } from './base'

export interface EnsureUserInput {
  readonly discordId: string
  readonly nickname?: string
  readonly lang?: string
}

/** 토지 한 장의 가로 칸 수 (docs/design/11-land.md). */
export const LAND_WIDTH = 4
/** 토지 한 장의 세로 칸 수 (docs/design/11-land.md). */
export const LAND_HEIGHT = 4
/** 유저가 기본 지급받는 첫 토지의 index (1부터 시작). */
export const STARTER_LAND_INDEX = 1
const DEFAULT_WAREHOUSE_GRADE = 1
/** 신규 유저 초기 자금 (docs/design/00-onboarding.md) */
const STARTER_MONEY = 1_000n

/**
 * 지정한 `targetIndex`로 Land 엔터티를 만들고, 4×4 특수 슬롯 그리드를 재추첨해서 저장한다.
 *
 * 각 토지는 독립적으로 특수 슬롯이 재추첨된다 (docs/design/11-land.md).
 * 호출 측에서 트랜잭션/중복 검증/자금 차감을 선행해야 한다 — 이 함수 자체는 순수 생성 로직.
 */
export async function createLandWithSlots(
  tx: Tx,
  userId: string,
  targetIndex: number
): Promise<void> {
  const land = await tx.land.create({
    data: {
      userId,
      index: targetIndex,
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
      lands: { include: { slots: true }, orderBy: { index: 'asc' } },
      warehouse: true
    }
  })
}

export type HydratedUser = Awaited<ReturnType<typeof findHydratedUser>>

export const UserService = {
  /**
   * Idempotently ensure a User, their starter Land (index=1, 4×4 with generated special slots),
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
            money: STARTER_MONEY,
            ...(nickname !== undefined ? { nickname } : {}),
            ...(lang !== undefined ? { lang } : {})
          }
        })
      }

      const hasLand = await tx.land.findUnique({
        where: {
          userId_index: { userId: discordId, index: STARTER_LAND_INDEX }
        },
        select: { id: true }
      })
      if (!hasLand) {
        await createLandWithSlots(tx, discordId, STARTER_LAND_INDEX)
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
