/**
 * 마켓 서비스 (v1: list 등록만).
 *
 * `MarketListing` 행을 만들고 창고 자재를 차감한다.
 * 등록 직후 `QuestService.progress` 로 `MARKET_LISTED` 이벤트를 발화해 Q3 트리거를 살린다.
 *
 * buy/cancel/expire 는 후속 PR — `MarketListing.status` 컬럼은 이미 `ACTIVE/SOLD/EXPIRED/CANCELED` 를 지원.
 *
 * 참조: docs/design/06-market.md, docs/design/00-onboarding.md §튜토리얼 퀘스트 #3
 */

import type { MarketListing, PrismaClient } from '@idle/database'
import type { MaterialType } from '@idle/game-core'
import { ServiceError, runInTx } from './base'
import { QuestService, type QuestProgressResult } from './quest'

/** 등록 가능 기간 한도 (docs/06). */
const MIN_DURATION_DAYS = 1
const MAX_DURATION_DAYS = 30
/** 단가 하한. */
const MIN_PRICE_PER_UNIT = 1n
/** 등록 수량 하한. */
const MIN_QUANTITY = 1n
/**
 * 마켓 등록 시점 세율(고정).
 * docs/06-market.md §세율 — 신뢰도/레벨에 따라 가변이지만 v1 은 5% 단일값으로 박는다.
 */
const DEFAULT_TAX_RATE = 0.05

export interface MarketListInput {
  readonly userId: string
  readonly material: MaterialType
  readonly quantity: bigint
  readonly pricePerUnit: bigint
  readonly durationDays: number
}

export interface MarketListResult {
  readonly listing: MarketListing
  readonly quest: QuestProgressResult
}

export const MarketService = {
  /**
   * 자재를 마켓에 등록한다.
   *
   * 1. 입력 검증 (수량/가격/기간).
   * 2. 창고 잔량 확인 후 차감.
   * 3. `MarketListing.create` (status=ACTIVE, taxRate 고정).
   * 4. `QuestService.progress` 로 `MARKET_LISTED` 발화.
   *
   * @throws {ServiceError}
   *  - `INVALID_QUANTITY`, `INVALID_PRICE`, `INVALID_DURATION` — 입력 위반
   *  - `USER_NOT_FOUND` — 유저 또는 창고 없음
   *  - `INSUFFICIENT_MATERIAL` — 창고 잔량 부족
   */
  async list(
    prisma: PrismaClient,
    input: MarketListInput
  ): Promise<MarketListResult> {
    const { userId, material, quantity, pricePerUnit, durationDays } = input

    if (quantity < MIN_QUANTITY) {
      throw new ServiceError('INVALID_QUANTITY', 'quantity must be >= 1')
    }
    if (pricePerUnit < MIN_PRICE_PER_UNIT) {
      throw new ServiceError('INVALID_PRICE', 'pricePerUnit must be >= 1')
    }
    if (
      !Number.isInteger(durationDays) ||
      durationDays < MIN_DURATION_DAYS ||
      durationDays > MAX_DURATION_DAYS
    ) {
      throw new ServiceError(
        'INVALID_DURATION',
        `durationDays must be integer in [${MIN_DURATION_DAYS}, ${MAX_DURATION_DAYS}]`
      )
    }

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true }
      })
      if (!user) throw new ServiceError('USER_NOT_FOUND')

      const warehouse = await tx.warehouse.findUnique({
        where: { userId },
        select: { id: true }
      })
      if (!warehouse) {
        throw new ServiceError(
          'USER_NOT_FOUND',
          `warehouse missing for user ${userId}`
        )
      }

      const stack = await tx.warehouseStack.findUnique({
        where: {
          warehouseId_material: { warehouseId: warehouse.id, material }
        }
      })
      if (!stack || stack.count < quantity) {
        throw new ServiceError('INSUFFICIENT_MATERIAL', undefined, {
          material,
          required: quantity.toString(),
          have: (stack?.count ?? 0n).toString()
        })
      }

      await tx.warehouseStack.update({
        where: { id: stack.id },
        data: { count: { decrement: quantity } }
      })

      const expiresAt = new Date(
        Date.now() + durationDays * 24 * 60 * 60 * 1000
      )

      // MarketListing.qty 가 Int 라 Int 범위 검증 필요 — 마이그레이션 전까지는 그대로 사용.
      const qtyAsNumber = Number(quantity)
      if (!Number.isSafeInteger(qtyAsNumber)) {
        throw new ServiceError(
          'INVALID_QUANTITY',
          'quantity exceeds safe integer range'
        )
      }

      const listing = await tx.marketListing.create({
        data: {
          sellerId: userId,
          material,
          price: pricePerUnit,
          qty: qtyAsNumber,
          durationDays,
          taxRate: DEFAULT_TAX_RATE,
          expiresAt
        }
      })

      const quest = await QuestService.progress(tx, userId, {
        kind: 'MARKET_LISTED',
        material,
        quantity,
        pricePerUnit
      })

      return { listing, quest }
    })
  }
} as const
