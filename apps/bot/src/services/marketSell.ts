/**
 * 글로벌 마켓 즉시 판매 서비스 (#15 U-3).
 *
 * 유저 창고의 자재를 글로벌 마켓(시스템)에 즉시 판매한다. 유저 상점
 * (`market.ts`)과 달리 구매자·등록 개념이 없다:
 *  - 판매가 = `GlobalMarketPrice.currentPrice` × 100% (수수료 0, #15 U-3 확정)
 *  - 수량 무제한 (v1)
 *  - 체결 즉시 `recentSales += qty` 로 다음 30분 tick 의 demandFactor 에 반영
 *    (docs/design/06-market.md §가격 산출 공식)
 *
 * 튜토리얼 연동: 체결 시 `MARKET_LISTED` 퀘스트 이벤트를 발화해 구매자가 없는
 * 1인 서버에서도 Q3("자재 판매")를 완주할 수 있다 (#15 핵심 목표).
 *
 * 참조: docs/design/06-market.md, docs/design/09-level-xp.md §이벤트별 XP
 */

import type { PrismaClient } from '@idle/database'
import type { MaterialType } from '@idle/game-core'
import { xpForEvent } from '@idle/game-core'
import { ServiceError, runInTx } from './base'
import { QuestService, type QuestProgressResult } from './quest'
import { RewardService } from './reward'
import { recordMarketTrade } from './tradeLog'

/** 판매 수량 하한. */
const MIN_QUANTITY = 1n

/**
 * `GlobalMarketPrice.recentSales`(Int4) 상한 — 통계 컬럼 오버플로 방어.
 * 판매 자체(BigInt 정산)는 무제한이며(#15 U-3 "수량 무제한 v1"), 통계
 * 누적만 이 값에서 포화(clamp)시킨다.
 */
const RECENT_SALES_MAX = 2_147_483_647

export interface GlobalSellInput {
  readonly userId: string
  readonly material: MaterialType
  readonly quantity: bigint
  /** 판매가 발생한 활동 서버 snowflake. TradeLog.guildId 로 기록. */
  readonly guildId?: string | null
}

export interface GlobalSellResult {
  readonly material: MaterialType
  readonly quantity: bigint
  /** 체결 단가 — 체결 시점의 `currentPrice`. */
  readonly unitPrice: bigint
  /** 지급 총액 = unitPrice × quantity (수수료 0). */
  readonly totalPaid: bigint
  /** 판매 XP 지급으로 레벨업이 발생했는지. */
  readonly leveledUp: boolean
  /** 지급 후 레벨. */
  readonly newLevel: number
  /** 지급된 판매 XP. */
  readonly xpAwarded: bigint
  /** `MARKET_LISTED` 퀘스트 진행 결과 — 상위 핸들러가 완료 알림에 사용. */
  readonly quest: QuestProgressResult
}

/** 창고 보유 자재 한 줄 — `/market sell` Select UI 용. */
export interface SellableStack {
  readonly material: MaterialType
  readonly count: bigint
}

export const MarketSellService = {
  /**
   * 자재를 글로벌 마켓에 즉시 판매한다.
   *
   * 단일 트랜잭션(Serializable):
   *  1. 유저·창고·잔량 검증 (`USER_NOT_FOUND`, `INSUFFICIENT_MATERIAL`).
   *  2. `GlobalMarketPrice` 조회 — 행이 없으면 `PRICE_NOT_FOUND`
   *     (시드가 13종 전부 보장: packages/database/prisma/seed.ts).
   *  3. 창고 차감 → `currentPrice × qty` 지급.
   *  4. `recentSales += qty` — 다음 tick 의 demandFactor 입력. 공식상 윈도
   *     거래량이 EMA 를 웃돌면 가격 상승 요인이 된다 (docs/design/06-market.md
   *     §가격 산출 공식 — 이슈 #15 의 "가격 하락 압력" 표현과 방향이 다름).
   *     #16 확정: 직구매(DirectBuyService)도 부호 분리 없이 같은 recentSales 에
   *     단일 누적한다 — recentSales 는 방향 없는 "거래 활동량" 신호로 두고 문서
   *     공식을 유지한다. 판매(공급)/직구매(수요) 부호 분리 재설계는 밸런스
   *     시뮬레이터(#31) 검증 이후로 이월. Int4 상한에서 포화.
   *  5. `TradeLog` 기록 — kind=MARKET_SELL, toUserId=null·price>0 (글로벌 판매
   *     규약). price=0 인 취소/만료 회수와 구분된다 (schema `TradeLog` 주석).
   *  6. 판매 XP +20 지급 (docs/design/09-level-xp.md §이벤트별 XP "마켓 판매
   *     (유저/글로벌) +20"). 상대가 없으므로 반복 상대 감쇠는 미적용.
   *  7. `MARKET_LISTED` 퀘스트 이벤트 발화 — Q3 진행.
   *
   * ⚠️ XP 파밍 리스크(v1 알려진 구멍): 감쇠·쿨다운이 없어 1개씩 쪼개 팔면
   * 판매 건수만큼 +20 XP 를 무한 반복 획득할 수 있다. 자재 생산량이 유일한
   * 상한이며, 사기 방지 v1(후속 이슈)에서 건당 최소 수량·쿨다운·일일 상한
   * 등으로 보완한다. v1 은 의도적으로 그대로 둔다 (#15 스코프).
   *
   * 판매 자재 제한은 서비스가 강제하지 않는다 — 유저 상점 `list()` 와 동일하게
   * UI(핸들러의 MATERIAL_CHOICES 검증, RAW_BOOSTER 제외)가 담당한다.
   *
   * @throws {ServiceError}
   *  - `INVALID_QUANTITY` — 수량 < 1
   *  - `USER_NOT_FOUND` — 유저 또는 창고 없음
   *  - `INSUFFICIENT_MATERIAL` — 창고 잔량 부족
   *  - `PRICE_NOT_FOUND` — 글로벌 가격 행 없음(시드 누락)
   */
  async sellToGlobal(
    prisma: PrismaClient,
    input: GlobalSellInput
  ): Promise<GlobalSellResult> {
    const { userId, material, quantity, guildId = null } = input

    if (quantity < MIN_QUANTITY) {
      throw new ServiceError('INVALID_QUANTITY', 'quantity must be >= 1')
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

      const unitPrice = price.currentPrice
      const totalPaid = unitPrice * quantity

      // 창고 차감.
      await tx.warehouseStack.update({
        where: { id: stack.id },
        data: { count: { decrement: quantity } }
      })

      // 대금(MONEY) + 판매 XP(+20, 감쇠 없음) 일괄 지급 — 레벨업 일관 처리.
      const xpAwarded = xpForEvent({ kind: 'MARKET_SELL' })
      const grant = await RewardService.grant(tx, userId, [
        { kind: 'MONEY', amount: totalPaid },
        { kind: 'XP', amount: xpAwarded }
      ])

      // 거래량 윈도 누적 — Int4 상한 포화(read-modify-write, Serializable 격리라 안전).
      const statsDelta =
        quantity > BigInt(RECENT_SALES_MAX)
          ? RECENT_SALES_MAX
          : Number(quantity)
      const nextRecentSales = Math.min(
        price.recentSales + statsDelta,
        RECENT_SALES_MAX
      )
      await tx.globalMarketPrice.update({
        where: { material },
        data: { recentSales: nextRecentSales }
      })

      // 거래 로그(글로벌 판매): from=판매자·to=null·amount=수량·price=총액(>0).
      await recordMarketTrade(tx, {
        fromUserId: userId,
        toUserId: null,
        material,
        amount: quantity,
        price: totalPaid,
        guildId
      })

      // 퀘스트 Q3("자재 판매") — 글로벌 판매도 동일 이벤트로 진행.
      const quest = await QuestService.progress(tx, userId, {
        kind: 'MARKET_LISTED',
        material,
        quantity,
        pricePerUnit: unitPrice
      })

      return {
        material,
        quantity,
        unitPrice,
        totalPaid,
        leveledUp: grant.leveledUp,
        newLevel: grant.newLevel,
        xpAwarded,
        quest
      }
    })
  },

  /**
   * `/market sell` Select UI 용 — 창고에서 보유 중(count>0)인 자재 목록.
   *
   * `materials` 로 판매 허용 자재 집합(UI 의 MATERIAL_CHOICES — RAW_BOOSTER
   * 제외 12종)을 받아 그 안의 보유분만 돌려준다. 창고가 없으면 빈 배열.
   */
  async listSellableStacks(
    prisma: PrismaClient,
    userId: string,
    materials: readonly MaterialType[]
  ): Promise<SellableStack[]> {
    const warehouse = await prisma.warehouse.findUnique({
      where: { userId },
      select: { id: true }
    })
    if (!warehouse) return []

    const stacks = await prisma.warehouseStack.findMany({
      where: {
        warehouseId: warehouse.id,
        material: { in: [...materials] },
        count: { gt: 0n }
      },
      orderBy: { material: 'asc' },
      select: { material: true, count: true }
    })
    return stacks.map((s) => ({
      material: s.material as MaterialType,
      count: s.count
    }))
  }
} as const
