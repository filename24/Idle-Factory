/**
 * 글로벌 마켓 가격 서비스.
 *
 * 30분 가격 tick(`priceTick`)과 시세 조회(`listPrices`)를 제공한다.
 * `market.ts`(유저 상점)가 이미 크므로 글로벌 가격 도메인을 분리했다.
 *
 * 산식은 순수 모듈 `@idle/game-core` 의 `computeNextPrice` 에 위임하고,
 * 랜덤 노이즈는 이 서비스가 생성해 주입한다 — 테스트는 결정적 noiseFor 를
 * 주입해 산식·클램프·EMA·윈도 리셋을 검증한다.
 *
 * 참조: docs/design/06-market.md §가격 산출 공식, GitHub #15
 */

import type { GlobalMarketPrice, PrismaClient } from '@idle/database'
import type { MaterialType } from '@idle/game-core'
import {
  computeNextAvgSales,
  computeNextPrice,
  PRICE_NOISE_LIMIT
} from '@idle/game-core'
import { runInTx } from './base'

/**
 * 자재별 노이즈 생성기 시그니처. [-0.2, +0.2] 범위 값을 반환해야 하며,
 * 범위 밖 값은 `computeNextPrice` 가 방어적으로 클램프한다.
 */
export type NoiseFor = (material: MaterialType) => number

/** `MarketPriceService.priceTick` 옵션. */
export interface PriceTickOptions {
  /** 자재별 노이즈 주입 — 생략 시 uniform 랜덤 ±20%. 테스트 결정성용. */
  readonly noiseFor?: NoiseFor
  /** tick 기준 시각 — 생략 시 호출 시각. `windowStartedAt` 에 기록된다. */
  readonly now?: Date
}

/** 한 자재의 tick 결과 — 로깅·관측용 스냅샷. */
export interface PriceTickRow {
  readonly material: MaterialType
  /** tick 이전 가격. */
  readonly previousPrice: bigint
  /** tick 이후 가격. */
  readonly currentPrice: bigint
  /** 리셋 직전 윈도 거래량. */
  readonly recentSales: number
  /** 갱신된 거래량 EMA. */
  readonly avgSales: number
}

/** `MarketPriceService.priceTick` 결과. */
export interface PriceTickResult {
  /** 재계산된 자재 수. */
  readonly updatedCount: number
  /** 자재별 변경 내역. */
  readonly rows: readonly PriceTickRow[]
}

/** 시세 조회 한 줄 — `/market price` 렌더링용. */
export interface MaterialPriceView {
  readonly material: MaterialType
  readonly basePrice: bigint
  readonly currentPrice: bigint
  /**
   * 기준가 대비 등락(1만분율 정수). 예: +12.34% → 1234n.
   * float 곱셈 대신 1만분율 정수 산술 — tradeLog.ts 관례.
   * BigInt 나눗셈이라 0 방향 절사(표시용 통계값이므로 허용).
   */
  readonly changeFromBasePpm: bigint
  /** 마지막 갱신 시각. */
  readonly updatedAt: Date
}

/**
 * uniform 랜덤 노이즈 생성 — [-0.2, +0.2).
 * 근거: docs/design/06-market.md §가격 변동 "기본 변동 폭 ±20% (랜덤 노이즈)".
 */
function randomNoise(): number {
  return Math.random() * (PRICE_NOISE_LIMIT * 2) - PRICE_NOISE_LIMIT
}

/** 1만분율 분모 — 등락률 계산용. */
const PPM_DENOMINATOR = 10_000n

export const MarketPriceService = {
  /**
   * 전 자재 가격을 일괄 재계산한다 (30분 tick 전용).
   *
   * 단일 트랜잭션 안에서 자재별로:
   *  1. `computeNextPrice` 로 `currentPrice` 재계산 (노이즈는 여기서 주입),
   *  2. `computeNextAvgSales` 로 `avgSales` EMA 갱신 (`ema = ema×0.9 + recent×0.1`),
   *  3. `recentSales = 0` 윈도 리셋 + `windowStartedAt` 갱신.
   *
   * 시드 행이 없으면 아무것도 하지 않는다(updatedCount=0) — 가격 행은
   * `packages/database/prisma/seed.ts` 가 13종 전부 보장한다.
   *
   * 트랜잭션 재시도(P2034) 시 noiseFor 가 다시 호출될 수 있으므로, 테스트는
   * 순수(자재→노이즈 고정) 함수를 주입해야 한다.
   */
  async priceTick(
    prisma: PrismaClient,
    options?: PriceTickOptions
  ): Promise<PriceTickResult> {
    const noiseFor = options?.noiseFor ?? randomNoise
    const now = options?.now ?? new Date()

    return runInTx(prisma, async (tx) => {
      const prices = await tx.globalMarketPrice.findMany({
        orderBy: { material: 'asc' }
      })

      const rows: PriceTickRow[] = []
      for (const row of prices) {
        const material = row.material as MaterialType
        const nextPrice = computeNextPrice({
          basePrice: row.basePrice,
          recentSales: row.recentSales,
          avgSales: row.avgSales,
          noise: noiseFor(material)
        })
        const nextAvg = computeNextAvgSales(row.avgSales, row.recentSales)

        await tx.globalMarketPrice.update({
          where: { material: row.material },
          data: {
            currentPrice: nextPrice,
            avgSales: nextAvg,
            recentSales: 0,
            windowStartedAt: now
          }
        })

        rows.push({
          material,
          previousPrice: row.currentPrice,
          currentPrice: nextPrice,
          recentSales: row.recentSales,
          avgSales: nextAvg
        })
      }

      return { updatedCount: rows.length, rows }
    })
  },

  /**
   * 전 자재 시세를 조회한다 (read-only) — `/market price` 용.
   *
   * 기준가 대비 등락은 `(current-base)×10000/base` 1만분율 정수로 계산해
   * float 오차 없이 반환한다. 정렬은 enum 선언 순서가 아니라 material
   * 사전순 — 렌더러가 자체 순서(티어 그룹)로 재배열한다.
   */
  async listPrices(prisma: PrismaClient): Promise<MaterialPriceView[]> {
    const rows = await prisma.globalMarketPrice.findMany({
      orderBy: { material: 'asc' }
    })
    return rows.map(toPriceView)
  },

  /**
   * 단일 자재의 가격 행을 조회한다 (read-only). 시드 누락 시 null.
   */
  async getPrice(
    prisma: PrismaClient,
    material: MaterialType
  ): Promise<GlobalMarketPrice | null> {
    return prisma.globalMarketPrice.findUnique({ where: { material } })
  }
} as const

/** DB 행 → 시세 뷰 변환. */
function toPriceView(row: GlobalMarketPrice): MaterialPriceView {
  return {
    material: row.material as MaterialType,
    basePrice: row.basePrice,
    currentPrice: row.currentPrice,
    changeFromBasePpm:
      ((row.currentPrice - row.basePrice) * PPM_DENOMINATOR) / row.basePrice,
    updatedAt: row.updatedAt
  }
}
