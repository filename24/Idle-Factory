/**
 * 마켓 서비스.
 *
 * `MarketListing` 의 등록·구매·취소·만료 회수와 매물 조회/자동완성 헬퍼를 제공한다.
 * 등록 직후 `QuestService.progress` 로 `MARKET_LISTED` 이벤트를 발화해 Q3 트리거를 살린다.
 *
 * 모든 상태 변경 메서드는 `runInTx` (Serializable 격리) 로 감싼다.
 *
 * 참조: docs/design/06-market.md, docs/design/00-onboarding.md §튜토리얼 퀘스트 #3
 */

import type { ListingStatus, MarketListing, PrismaClient } from '@idle/database'
import type { MaterialType } from '@idle/game-core'
import { ServiceError, runInTx, type Tx } from './base'
import { QuestService, type QuestProgressResult } from './quest'

/** 등록 가능 기간 한도 (docs/06). */
const MIN_DURATION_DAYS = 1
const MAX_DURATION_DAYS = 30
/** 단가 하한. */
const MIN_PRICE_PER_UNIT = 1n
/** 등록 수량 하한. */
const MIN_QUANTITY = 1n
/** Discord autocomplete 응답 상한. */
const AUTOCOMPLETE_MAX = 25

/**
 * 등록 기간(일) → 세율 매핑.
 *
 * docs/design/06-market.md §기간별 세율 테이블. 등록 시점에 `MarketListing.taxRate`
 * 컬럼에 박혀 있으므로 추후 정책이 바뀌어도 매도자가 약속받은 세율로 정산한다.
 */
export function taxRateForDuration(days: number): number {
  if (days <= 3) return 0.03
  if (days <= 7) return 0.05
  if (days <= 14) return 0.08
  if (days <= 21) return 0.12
  return 0.18
}

/**
 * BigInt 총액 × float 세율 → 세액(BigInt). 소수점은 floor.
 *
 * float 곱셈을 피하려고 1만분율 정수로 환산해 정수 산술만 사용한다.
 */
function calcTax(gross: bigint, taxRate: number): bigint {
  const fixed = BigInt(Math.round(taxRate * 10_000))
  return (gross * fixed) / 10_000n
}

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

export interface MarketBuyInput {
  readonly buyerId: string
  readonly listingId: string
}

export interface MarketBuyResult {
  readonly listing: MarketListing
  readonly grossPrice: bigint
  readonly tax: bigint
  readonly netRevenue: bigint
}

export interface MarketCancelInput {
  readonly userId: string
  readonly listingId: string
}

export interface MarketCancelResult {
  readonly listing: MarketListing
  readonly returned: { material: MaterialType; quantity: bigint }
}

export interface MarketBrowseInput {
  readonly material?: MaterialType
  readonly page: number // 1-based
  readonly pageSize: number
}

export interface MarketBrowseResult {
  readonly listings: ReadonlyArray<MarketListing>
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

export interface MarketAutocompleteInput {
  readonly query: string
  readonly limit?: number
}

export interface MarketAutocompleteChoice {
  readonly id: string
  readonly material: MaterialType
  readonly qty: number
  readonly price: bigint
  readonly sellerId: string
}

export interface ExpireStaleResult {
  readonly expiredCount: number
}

/**
 * 매물 회수(창고 반환 + 상태 갱신) 공통 로직.
 *
 * cancel/expireStale 가 공유한다. 호출 측에서 사전 검증(권한·상태)을 끝낸 뒤
 * 호출해야 한다.
 */
async function returnStackAndMark(
  tx: Tx,
  listing: Pick<MarketListing, 'id' | 'sellerId' | 'material' | 'qty'>,
  nextStatus: Extract<ListingStatus, 'CANCELED' | 'EXPIRED'>
): Promise<MarketListing> {
  const warehouse = await tx.warehouse.findUnique({
    where: { userId: listing.sellerId },
    select: { id: true }
  })
  if (!warehouse) {
    throw new ServiceError(
      'USER_NOT_FOUND',
      `warehouse missing for seller ${listing.sellerId}`
    )
  }

  await tx.warehouseStack.upsert({
    where: {
      warehouseId_material: {
        warehouseId: warehouse.id,
        material: listing.material
      }
    },
    create: {
      warehouseId: warehouse.id,
      material: listing.material,
      count: BigInt(listing.qty)
    },
    update: { count: { increment: BigInt(listing.qty) } }
  })

  return tx.marketListing.update({
    where: { id: listing.id },
    data: { status: nextStatus }
  })
}

export const MarketService = {
  /**
   * 자재를 마켓에 등록한다.
   *
   * 1. 입력 검증 (수량/가격/기간).
   * 2. 창고 잔량 확인 후 차감.
   * 3. `MarketListing.create` (status=ACTIVE, taxRate=`taxRateForDuration(days)`).
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
          taxRate: taxRateForDuration(durationDays),
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
  },

  /**
   * 매물을 구매한다.
   *
   * 1. 매물/구매자 검증 (`LISTING_NOT_FOUND`, `LISTING_NOT_ACTIVE`, `SELF_PURCHASE`,
   *    `USER_NOT_FOUND`, `INSUFFICIENT_MONEY`).
   * 2. 구매자 자금 차감, 판매자에게 세후 금액 지급.
   * 3. 구매자 창고에 자재 입고 (upsert).
   * 4. `status = SOLD`.
   *
   * 세율은 등록 시점 `MarketListing.taxRate` 를 그대로 사용한다.
   */
  async buy(
    prisma: PrismaClient,
    input: MarketBuyInput
  ): Promise<MarketBuyResult> {
    const { buyerId, listingId } = input

    return runInTx(prisma, async (tx) => {
      const listing = await tx.marketListing.findUnique({
        where: { id: listingId }
      })
      if (!listing) throw new ServiceError('LISTING_NOT_FOUND')
      if (listing.status !== 'ACTIVE') {
        throw new ServiceError('LISTING_NOT_ACTIVE', undefined, {
          status: listing.status
        })
      }
      if (listing.expiresAt.getTime() <= Date.now()) {
        throw new ServiceError('LISTING_NOT_ACTIVE', 'listing expired')
      }
      if (listing.sellerId === buyerId) {
        throw new ServiceError('SELF_PURCHASE')
      }

      const buyer = await tx.user.findUnique({
        where: { id: buyerId },
        select: { id: true, money: true }
      })
      if (!buyer) throw new ServiceError('USER_NOT_FOUND')

      const buyerWarehouse = await tx.warehouse.findUnique({
        where: { userId: buyerId },
        select: { id: true }
      })
      if (!buyerWarehouse) {
        throw new ServiceError(
          'USER_NOT_FOUND',
          `warehouse missing for buyer ${buyerId}`
        )
      }

      const grossPrice = BigInt(listing.qty) * listing.price
      const tax = calcTax(grossPrice, listing.taxRate)
      const netRevenue = grossPrice - tax

      if (buyer.money < grossPrice) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: grossPrice.toString(),
          have: buyer.money.toString()
        })
      }

      await tx.user.update({
        where: { id: buyerId },
        data: { money: { decrement: grossPrice } }
      })
      await tx.user.update({
        where: { id: listing.sellerId },
        data: { money: { increment: netRevenue } }
      })

      await tx.warehouseStack.upsert({
        where: {
          warehouseId_material: {
            warehouseId: buyerWarehouse.id,
            material: listing.material
          }
        },
        create: {
          warehouseId: buyerWarehouse.id,
          material: listing.material,
          count: BigInt(listing.qty)
        },
        update: { count: { increment: BigInt(listing.qty) } }
      })

      const updated = await tx.marketListing.update({
        where: { id: listing.id },
        data: { status: 'SOLD' }
      })

      return { listing: updated, grossPrice, tax, netRevenue }
    })
  },

  /**
   * 본인 매물을 취소하고 자재를 창고에 반환한다.
   *
   * @throws `LISTING_NOT_FOUND` / `NOT_LISTING_OWNER` / `LISTING_NOT_ACTIVE`
   */
  async cancel(
    prisma: PrismaClient,
    input: MarketCancelInput
  ): Promise<MarketCancelResult> {
    const { userId, listingId } = input

    return runInTx(prisma, async (tx) => {
      const listing = await tx.marketListing.findUnique({
        where: { id: listingId }
      })
      if (!listing) throw new ServiceError('LISTING_NOT_FOUND')
      if (listing.sellerId !== userId) {
        throw new ServiceError('NOT_LISTING_OWNER')
      }
      if (listing.status !== 'ACTIVE') {
        throw new ServiceError('LISTING_NOT_ACTIVE', undefined, {
          status: listing.status
        })
      }

      const updated = await returnStackAndMark(tx, listing, 'CANCELED')
      return {
        listing: updated,
        returned: { material: listing.material, quantity: BigInt(listing.qty) }
      }
    })
  },

  /**
   * 만료된 ACTIVE 매물을 일괄 회수한다 (스케줄러 전용).
   *
   * 만료 매물 수가 폭증하지 않는 한(Phase 2 기준) 단순 for-loop 로 처리.
   */
  async expireStale(prisma: PrismaClient): Promise<ExpireStaleResult> {
    return runInTx(prisma, async (tx) => {
      const stale = await tx.marketListing.findMany({
        where: {
          status: 'ACTIVE',
          expiresAt: { lte: new Date() }
        },
        select: { id: true, sellerId: true, material: true, qty: true }
      })

      for (const listing of stale) {
        await returnStackAndMark(tx, listing, 'EXPIRED')
      }

      return { expiredCount: stale.length }
    })
  },

  /**
   * ACTIVE & 미만료 매물을 페이지네이션으로 조회한다 (read-only).
   */
  async browse(
    prisma: PrismaClient,
    input: MarketBrowseInput
  ): Promise<MarketBrowseResult> {
    const page = Math.max(1, Math.floor(input.page))
    const pageSize = Math.max(1, Math.floor(input.pageSize))
    const where = {
      status: 'ACTIVE' as const,
      expiresAt: { gt: new Date() },
      ...(input.material ? { material: input.material } : {})
    }
    const [total, listings] = await Promise.all([
      prisma.marketListing.count({ where }),
      prisma.marketListing.findMany({
        where,
        orderBy: [{ price: 'asc' }, { registeredAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ])
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return { listings, total, page, pageSize, totalPages }
  },

  /**
   * Discord autocomplete 용 매물 검색 (read-only, ACTIVE 미만료만).
   *
   * - `query` 가 비어 있으면 최근 등록순 상위 25개.
   * - `query` 가 cuid prefix 형태면 `id` startsWith 매칭.
   * - 그 외에는 `MaterialType` enum 의 대문자 prefix 매칭.
   */
  async searchActiveForAutocomplete(
    prisma: PrismaClient,
    input: MarketAutocompleteInput
  ): Promise<MarketAutocompleteChoice[]> {
    const limit = Math.min(input.limit ?? AUTOCOMPLETE_MAX, AUTOCOMPLETE_MAX)
    const query = input.query.trim()

    const baseWhere = {
      status: 'ACTIVE' as const,
      expiresAt: { gt: new Date() }
    }

    const where =
      query.length === 0
        ? baseWhere
        : (() => {
            // cuid 는 소문자/숫자 — `id startsWith`. material 은 enum 대문자 — 대문자 prefix.
            const upper = query.toUpperCase()
            const matchedMaterials = MATERIAL_VALUES.filter((m) =>
              m.startsWith(upper)
            )
            const orClauses: Array<Record<string, unknown>> = [
              { id: { startsWith: query } }
            ]
            if (matchedMaterials.length > 0) {
              orClauses.push({ material: { in: matchedMaterials } })
            }
            return { ...baseWhere, OR: orClauses }
          })()

    const rows = await prisma.marketListing.findMany({
      where,
      orderBy: { registeredAt: 'desc' },
      take: limit,
      select: {
        id: true,
        material: true,
        qty: true,
        price: true,
        sellerId: true
      }
    })

    return rows.map((r) => ({
      id: r.id,
      material: r.material as MaterialType,
      qty: r.qty,
      price: r.price,
      sellerId: r.sellerId
    }))
  },

  /**
   * 특정 자재의 현재 최저 활성 매물 단가를 반환한다.
   * 활성·미만료 매물이 없으면 null 을 반환한다.
   */
  async minActivePrice(
    prisma: PrismaClient,
    material: MaterialType
  ): Promise<bigint | null> {
    const listing = await prisma.marketListing.findFirst({
      where: {
        material,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() }
      },
      orderBy: { price: 'asc' },
      select: { price: true }
    })
    return listing?.price ?? null
  }
} as const

/** prisma enum 값 캐시 — 자동완성 매칭에서 사용. */
const MATERIAL_VALUES = [
  'GRAIN',
  'ORE',
  'WOOD',
  'CRUDE_OIL',
  'STEEL',
  'FUEL',
  'PLASTIC',
  'PROCESSED_FOOD',
  'FURNITURE',
  'CAR',
  'ELECTRONIC',
  'FINISHED_FOOD'
] as const satisfies ReadonlyArray<MaterialType>
