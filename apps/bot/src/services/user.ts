import type { PrismaClient } from '@idle/database'
import {
  LAND_INITIAL_HEIGHT,
  LAND_INITIAL_WIDTH,
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  generateSlotTypes,
  isInitiallyActive
} from '@idle/game-core'
import { runInTx, type Tx } from './base'

export interface EnsureUserInput {
  readonly discordId: string
  readonly nickname?: string
  readonly lang?: string
}

/** 유저의 첫 토지 index (docs/11-land.md — 1-based). */
const STARTER_LAND_INDEX = 1
const DEFAULT_WAREHOUSE_GRADE = 1
/** 신규 유저 초기 자금 (docs/design/00-onboarding.md) */
const STARTER_MONEY = 1_000n

/**
 * 신규 토지 한 장을 3×3 활성 + 7 locked 슬롯(전체 16칸)로 생성한다.
 *
 * - `Land.width/height` 는 "현재 활성 영역" — 최초 3×3, 최대 4×4 (docs/11 §슬롯 확장).
 * - Slot 레코드는 항상 4×4 = 16개 생성하되, 좌상단 3×3 영역 밖의 7칸은 `locked=true`.
 * - 특수 슬롯 추첨은 잠금 포함 16칸 전부에 적용한다(구매 전까지는 보너스 미적용).
 *
 * @param tx Prisma 트랜잭션
 * @param userId 대상 유저 id
 * @param targetIndex 생성할 토지 index (1..5)
 */
export async function createLandWithSlots(
  tx: Tx,
  userId: string,
  targetIndex: number = STARTER_LAND_INDEX
): Promise<void> {
  const land = await tx.land.create({
    data: {
      userId,
      index: targetIndex,
      width: LAND_INITIAL_WIDTH,
      height: LAND_INITIAL_HEIGHT
    }
  })

  // 잠긴 슬롯에도 특수 타입을 배치 (docs/11 §특수 슬롯 생성 규칙).
  const grid = generateSlotTypes({
    width: LAND_MAX_WIDTH,
    height: LAND_MAX_HEIGHT
  })

  const slotsData = grid.flatMap((row, y) =>
    row.map((type, x) => ({
      landId: land.id,
      x,
      y,
      type,
      locked: !isInitiallyActive(x, y)
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
   * Idempotently ensure a User, their starter Land (index=1, 3×3 active + 7 locked slots
   * with generated special types), and Warehouse (grade 1) exist. Safe to call repeatedly —
   * returns the hydrated User on every call.
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
