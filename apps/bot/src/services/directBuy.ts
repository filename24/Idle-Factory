/**
 * 자재 직구매 서비스 (#16).
 *
 * 돈으로 자재를 즉시 구매한다 — 급할 때 보조 수단이며 정상 루프는 공장 생산
 * (docs/design/04-economy.md §자재 직구매):
 *  - 단가 = 글로벌 현재가 ×2 할증 (`directBuyUnitPrice`)
 *  - T1+T2 자재 9종만 허용 — T3 완제품·RAW_BOOSTER 차단
 *  - 일일 총 한도: 레벨 구간별 100/500/2,000/10,000 (전 자재 합산)
 *  - 한도 리셋: 매일 KST 자정 (#16 확정 — 04 문서의 "UTC 00:00 (or 서버 시각)"
 *    표기를 U-6 주간 정산 KST 와 일관되게 확정). 일자 키는 `kstDayStart`.
 *  - 한도의 단일 진실 소스 = `DailyPurchase` 테이블 (userId+date unique).
 *    `User.dailyBought` 캐시 컬럼은 deprecated — 읽기/쓰기 모두 하지 않는다.
 *
 * XP 미지급: 구매 행위는 XP 이벤트가 아니다 (docs/design/09-level-xp.md
 * §이벤트별 XP — 구매 항목 없음, 구매자 XP 없음 규약과 동일).
 *
 * 창고 용량 정책: 기존 유저 상점 구매(`MarketService.buy`)와 동일하게 용량
 * 검사 없이 upsert 입고한다 — 현재 창고 용량은 어느 입고 경로에서도 강제되지
 * 않으며(`WAREHOUSE_FULL` 은 예약만 된 코드), 직구매만 다르게 막지 않는다.
 *
 * 참조: docs/design/04-economy.md, GitHub #16
 */

import type { PrismaClient } from '@idle/database'
import type { MaterialType } from '@idle/game-core'
import {
  directBuyDailyLimit,
  directBuyUnitPrice,
  isDirectBuyMaterial,
  kstDayStart,
  kstNextDayStart
} from '@idle/game-core'
import { ServiceError, runInTx } from './base'
import { recordDirectBuyTrade } from './tradeLog'

/** 구매 수량 하한. */
const MIN_QUANTITY = 1n

/**
 * `GlobalMarketPrice.recentSales`(Int4) 상한 — 통계 컬럼 오버플로 방어.
 * `MarketSellService.sellToGlobal` 의 포화(read-modify-write) 패턴과 동일.
 */
const RECENT_SALES_MAX = 2_147_483_647

/** `DirectBuyService.buy` 입력. */
export interface DirectBuyInput {
  readonly userId: string
  readonly material: MaterialType
  readonly quantity: bigint
  /** 구매가 발생한 활동 서버 snowflake. TradeLog.guildId 로 기록. */
  readonly guildId?: string | null
  /** 기준 시각 주입 — KST 일자 키 경계 테스트용. 생략 시 호출 시각. */
  readonly now?: Date
}

/** `DirectBuyService.buy` 결과. */
export interface DirectBuyResult {
  readonly material: MaterialType
  readonly quantity: bigint
  /** 체결 단가 — 체결 시점 `currentPrice × 2` (04 §가격 결정). */
  readonly unitPrice: bigint
  /** 지불 총액 = unitPrice × quantity. */
  readonly totalCost: bigint
  /** 오늘(KST)의 일일 총 한도. */
  readonly dailyLimit: number
  /** 이번 구매 반영 후 오늘 누적 구매량. */
  readonly dailyUsed: number
  /** 남은 일일 한도. */
  readonly dailyRemaining: number
  /** 한도 리셋 시각 (다음 KST 자정의 UTC 순간). */
  readonly resetsAt: Date
}

/** 일일 한도 사용 현황 — UI(수량 Select·확인 단계) 표시용. */
export interface DailyLimitUsage {
  /** 오늘(KST)의 일일 총 한도 (레벨 구간별). */
  readonly limit: number
  /** 오늘 누적 구매량. */
  readonly used: number
  /** 남은 한도 (>= 0). */
  readonly remaining: number
  /** 한도 리셋 시각 (다음 KST 자정의 UTC 순간). */
  readonly resetsAt: Date
}

export const DirectBuyService = {
  /**
   * 자재를 직구매한다 (돈 → 자재).
   *
   * 단일 트랜잭션(Serializable):
   *  1. 자재 검증 — T1+T2 만 허용 (`MATERIAL_NOT_DIRECT_BUYABLE`).
   *  2. 유저·창고 검증 (`USER_NOT_FOUND`).
   *  3. `GlobalMarketPrice` 조회 (`PRICE_NOT_FOUND`) → 단가 = 현재가 ×2.
   *  4. 일일 한도 검증 — `DailyPurchase(userId, kstDayStart(now))` 누적 +
   *     레벨 구간 한도 비교 (`DAILY_LIMIT_EXCEEDED`). 전 자재 합산 한도
   *     (docs/design/04-economy.md "곡물 50 + 광석 50 = 100, 한도 소진").
   *  5. 자금 검증·차감 (`INSUFFICIENT_MONEY`).
   *  6. 창고 입고 (upsert — 용량 검사 없음, 모듈 JSDoc 참조).
   *  7. `DailyPurchase` upsert 로 한도 소진 기록.
   *  8. `recentSales += qty` — 부호 분리 없이 판매와 같은 컬럼에 단일 누적
   *     (#16 확정, `MarketSellService.sellToGlobal` JSDoc 논점 참조). 수요/공급
   *     분리 재설계는 #31 밸런스 시뮬레이터 이후. Int4 상한에서 포화.
   *  9. `TradeLog` 기록 — kind=DIRECT_BUY, from=null(시스템)·to=구매자·
   *     price=총액 (`recordDirectBuyTrade` 규약).
   *
   * XP 는 지급하지 않는다 (docs/design/09-level-xp.md — 구매 행위 XP 없음).
   *
   * @throws {ServiceError}
   *  - `INVALID_QUANTITY` — 수량 < 1
   *  - `MATERIAL_NOT_DIRECT_BUYABLE` — T3·RAW_BOOSTER
   *  - `USER_NOT_FOUND` — 유저 또는 창고 없음
   *  - `PRICE_NOT_FOUND` — 글로벌 가격 행 없음(시드 누락)
   *  - `DAILY_LIMIT_EXCEEDED` — 일일 한도 초과 (details: limit/used/remaining)
   *  - `INSUFFICIENT_MONEY` — 잔액 부족
   */
  async buy(
    prisma: PrismaClient,
    input: DirectBuyInput
  ): Promise<DirectBuyResult> {
    const { userId, material, quantity, guildId = null } = input
    // now 는 트랜잭션 재시도(P2034) 간에도 안정적이도록 tx 바깥에서 한 번 캡처.
    const now = input.now ?? new Date()

    if (quantity < MIN_QUANTITY) {
      throw new ServiceError('INVALID_QUANTITY', 'quantity must be >= 1')
    }
    if (!isDirectBuyMaterial(material)) {
      throw new ServiceError('MATERIAL_NOT_DIRECT_BUYABLE', undefined, {
        material
      })
    }

    return runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, money: true, level: true }
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

      const price = await tx.globalMarketPrice.findUnique({
        where: { material }
      })
      if (!price) {
        throw new ServiceError(
          'PRICE_NOT_FOUND',
          `global market price missing for ${material}`,
          { material }
        )
      }

      const unitPrice = directBuyUnitPrice(price.currentPrice)
      const totalCost = unitPrice * quantity

      // 일일 한도 — DailyPurchase 가 단일 진실 소스 (KST 일자 키).
      const dateKey = kstDayStart(now)
      const limit = directBuyDailyLimit(user.level)
      const purchase = await tx.dailyPurchase.findUnique({
        where: { userId_date: { userId, date: dateKey } },
        select: { totalBought: true }
      })
      const used = purchase?.totalBought ?? 0
      const remaining = Math.max(0, limit - used)
      // BigInt 수량을 Number 한도와 비교 — 한도(≤10,000)를 넘는 수량은 전부 초과.
      if (quantity > BigInt(remaining)) {
        throw new ServiceError('DAILY_LIMIT_EXCEEDED', undefined, {
          limit,
          used,
          remaining,
          requested: quantity.toString()
        })
      }
      const quantityAsNumber = Number(quantity) // 한도 검증을 통과했으므로 안전(≤10,000)

      if (user.money < totalCost) {
        throw new ServiceError('INSUFFICIENT_MONEY', undefined, {
          required: totalCost.toString(),
          have: user.money.toString()
        })
      }

      // 자금 차감.
      await tx.user.update({
        where: { id: userId },
        data: { money: { decrement: totalCost } }
      })

      // 창고 입고 (용량 검사 없음 — MarketService.buy 와 동일 정책).
      await tx.warehouseStack.upsert({
        where: {
          warehouseId_material: { warehouseId: warehouse.id, material }
        },
        create: { warehouseId: warehouse.id, material, count: quantity },
        update: { count: { increment: quantity } }
      })

      // 일일 한도 소진 기록.
      await tx.dailyPurchase.upsert({
        where: { userId_date: { userId, date: dateKey } },
        create: { userId, date: dateKey, totalBought: quantityAsNumber },
        update: { totalBought: { increment: quantityAsNumber } }
      })

      // 거래량 윈도 누적 — Int4 상한 포화(read-modify-write, Serializable 격리라 안전).
      const nextRecentSales = Math.min(
        price.recentSales + quantityAsNumber,
        RECENT_SALES_MAX
      )
      await tx.globalMarketPrice.update({
        where: { material },
        data: { recentSales: nextRecentSales }
      })

      // 거래 로그 — kind=DIRECT_BUY, from=null(시스템)·to=구매자·price=총액.
      await recordDirectBuyTrade(tx, {
        buyerId: userId,
        material,
        amount: quantity,
        price: totalCost,
        guildId
      })

      return {
        material,
        quantity,
        unitPrice,
        totalCost,
        dailyLimit: limit,
        dailyUsed: used + quantityAsNumber,
        dailyRemaining: Math.max(0, remaining - quantityAsNumber),
        resetsAt: kstNextDayStart(now)
      }
    })
  },

  /**
   * 오늘(KST)의 일일 한도 사용 현황을 조회한다 (read-only) — UI 표시용.
   *
   * 한도는 레벨 구간별(`directBuyDailyLimit`), 사용량은 `DailyPurchase` 의
   * KST 일자 키 행에서 읽는다. 유저가 없으면 `USER_NOT_FOUND`.
   */
  async getDailyUsage(
    prisma: PrismaClient,
    userId: string,
    now: Date = new Date()
  ): Promise<DailyLimitUsage> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { level: true }
    })
    if (!user) throw new ServiceError('USER_NOT_FOUND')

    const limit = directBuyDailyLimit(user.level)
    const purchase = await prisma.dailyPurchase.findUnique({
      where: { userId_date: { userId, date: kstDayStart(now) } },
      select: { totalBought: true }
    })
    const used = purchase?.totalBought ?? 0
    return {
      limit,
      used,
      remaining: Math.max(0, limit - used),
      resetsAt: kstNextDayStart(now)
    }
  }
} as const
