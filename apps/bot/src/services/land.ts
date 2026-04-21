import type { PrismaClient } from '@idle/database'
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
    select: { money: true }
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
        `targetIndex must be integer in [${MIN_BUYABLE_INDEX}, ${MAX_BUYABLE_INDEX}], got ${targetIndex}`
      )
    }

    return runInTx(prisma, async (tx) => {
      const existingCount = await tx.land.count({ where: { userId } })

      if (existingCount >= MAX_LANDS) {
        throw new ServiceError(
          'MAX_LANDS',
          `user ${userId} already owns ${existingCount} lands (max ${MAX_LANDS})`
        )
      }

      if (existingCount !== targetIndex - 1) {
        throw new ServiceError(
          'INVALID_LAND_INDEX',
          `cannot buy index ${targetIndex}: user has ${existingCount} lands (expected ${targetIndex - 1})`
        )
      }

      const duplicate = await tx.land.findUnique({
        where: { userId_index: { userId, index: targetIndex } },
        select: { id: true }
      })
      if (duplicate) {
        throw new ServiceError(
          'LAND_ALREADY_EXISTS',
          `land index ${targetIndex} already exists for user ${userId}`
        )
      }

      const cost = landCost(targetIndex)
      const money = await loadUserMoney(tx, userId)
      if (money < cost) {
        throw new ServiceError(
          'INSUFFICIENT_MONEY',
          `need ${cost} money to buy land ${targetIndex}, have ${money}`
        )
      }

      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: cost } }
      })

      await createLandWithSlots(tx, userId, targetIndex)

      return {
        targetIndex,
        cost,
        remainingMoney: money - cost,
        totalLands: existingCount + 1
      }
    })
  }
} as const
