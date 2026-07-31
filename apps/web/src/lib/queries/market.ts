import { unstable_cache } from 'next/cache'
import type { MaterialType } from '@idle/game-core'
import { db } from '../db'
import { changeFromBasePpm, msUntilExpiry, totalPrice } from '../market-math'

/**
 * 글로벌 마켓 시세·매물 조회 계층.
 *
 * ## 매물은 길드로 필터하지 않는다
 *
 * 봇의 `MarketService.browse` 는 `status`·`expiresAt`·`material` 만 본다
 * (`apps/bot/src/services/market.ts`). `MarketListing.guildId` 는 거래 로그
 * 귀속용 best-effort 필드일 뿐 접근 범위를 정하지 않는다. 여기서 길드 필터를
 * 새로 만들면 봇에 없는 규칙을 발명하는 셈이다 — 하지 않는다.
 * (주식은 다르다. `queries/stocks.ts` 참고.)
 */

/** 시세 보드 캐시 TTL(초). 원본은 30분마다 tick 하므로 5분이면 충분히 신선하다. */
export const MARKET_PRICE_REVALIDATE_SECONDS = 300
/** 매물 캐시 TTL(초). 플레이어가 수시로 등록·구매하므로 짧게 잡는다. */
export const MARKET_LISTING_REVALIDATE_SECONDS = 60
/** 매물 페이지당 항목 수. */
export const MARKET_PAGE_SIZE = 20
/** 딥 페이지네이션 방지 상한. */
const MAX_PAGE = 1000

/** 시세 보드 한 줄. */
export interface MaterialPriceEntry {
  readonly material: MaterialType
  readonly basePrice: string
  readonly currentPrice: string
  /** 기준가 대비 등락 1만분율. */
  readonly changeFromBasePpm: number
  /** 현재 30분 윈도 누적 거래량. */
  readonly recentSales: number
  readonly updatedAt: string
}

/** 시세 보드 전체. */
export interface MarketPriceBoard {
  readonly entries: readonly MaterialPriceEntry[]
  /** 현재 30분 윈도 시작 시각. 데이터가 없으면 null. */
  readonly windowStartedAt: string | null
}

/** 활성 매물 한 줄. */
export interface MarketListingEntry {
  readonly id: string
  readonly material: MaterialType
  readonly unitPrice: string
  readonly qty: number
  readonly totalPrice: string
  /** 등록 시점에 확정된 세율. */
  readonly taxRate: number
  readonly expiresAt: string
  /** 만료까지 남은 밀리초. 음수면 만료됨. */
  readonly msUntilExpiry: number
  readonly sellerNickname: string | null
}

/** 페이지네이션 결과. */
export interface MarketListingPage {
  readonly entries: readonly MarketListingEntry[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
}

/** 페이지 번호를 정규화한다. 신뢰할 수 없는 입력을 받는다. */
export function normalizePage(raw: unknown): number {
  const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) return 1
  return Math.min(Math.floor(parsed), MAX_PAGE)
}

/**
 * 글로벌 자재 시세 보드를 가져온다.
 *
 * `new Date()` 를 캐시 함수 **안에서** 부르지 않는 이유는 여기 시세 조회에
 * 시각 조건이 없기 때문이다. 매물 조회(`getMarketListings`)에서는 반대로
 * 반드시 안에서 불러야 한다 — 아래 주석 참고.
 */
export const getMarketPriceBoard = unstable_cache(
  async (): Promise<MarketPriceBoard> => {
    const rows = await db.globalMarketPrice.findMany({ orderBy: { material: 'asc' } })

    return {
      entries: rows.map((row) => ({
        material: row.material as MaterialType,
        basePrice: row.basePrice.toString(),
        currentPrice: row.currentPrice.toString(),
        changeFromBasePpm: changeFromBasePpm(row.currentPrice, row.basePrice),
        recentSales: row.recentSales,
        updatedAt: row.updatedAt.toISOString(),
      })),
      windowStartedAt: rows[0]?.windowStartedAt.toISOString() ?? null,
    }
  },
  ['market-price-board'],
  { revalidate: MARKET_PRICE_REVALIDATE_SECONDS, tags: ['market-prices'] },
)

/**
 * 활성 매물 목록을 가져온다.
 *
 * `material` 은 신뢰할 수 없는 입력이라 그대로 넘기지 않고, 값이 있을 때만
 * 필터에 포함한다(Prisma 가 알 수 없는 enum 값을 받으면 예외를 던진다).
 *
 * @param material 자재 필터. 없으면 전체
 * @param rawPage 페이지 번호(신뢰할 수 없는 입력)
 */
export const getMarketListings = unstable_cache(
  async (material: string | null, rawPage: unknown): Promise<MarketListingPage> => {
    const page = normalizePage(rawPage)
    // 캐시 함수 **안에서** 현재 시각을 만든다. 인자로 받으면 매 요청마다 캐시
    // 키가 달라져 캐시가 영원히 적중하지 않는다.
    const now = new Date()

    const where = {
      status: 'ACTIVE' as const,
      expiresAt: { gt: now },
      ...(material ? { material: material as MaterialType } : {}),
    }

    const [total, rows] = await Promise.all([
      db.marketListing.count({ where }),
      db.marketListing.findMany({
        where,
        orderBy: [{ price: 'asc' }, { registeredAt: 'desc' }],
        skip: (page - 1) * MARKET_PAGE_SIZE,
        take: MARKET_PAGE_SIZE,
        select: {
          id: true,
          material: true,
          price: true,
          qty: true,
          taxRate: true,
          expiresAt: true,
          seller: { select: { nickname: true } },
        },
      }),
    ])

    return {
      entries: rows.map((row) => ({
        id: row.id,
        material: row.material as MaterialType,
        unitPrice: row.price.toString(),
        qty: row.qty,
        totalPrice: totalPrice(row.price, row.qty).toString(),
        taxRate: row.taxRate,
        expiresAt: row.expiresAt.toISOString(),
        msUntilExpiry: msUntilExpiry(row.expiresAt, now),
        sellerNickname: row.seller?.nickname ?? null,
        // 판매자 식별자는 내보내지 않는다 — 공개 표면의 개인 식별자 비노출
        // 규약(`api/ranking/users/route.ts`)과 같은 선이다.
      })),
      total,
      page,
      pageSize: MARKET_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE)),
    }
  },
  ['market-listings'],
  { revalidate: MARKET_LISTING_REVALIDATE_SECONDS, tags: ['market-listings'] },
)
