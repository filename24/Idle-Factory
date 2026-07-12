/**
 * 주간 배당 정산 서비스 (#18).
 *
 * 매주 일요일 00:00 KST(D2 — weekly-settlement 와 동일 cron '0 15 * * 6')
 * 기준으로 전 상장 종목의 주간 수익(`Stock.weeklyProfit`) 10%(기본,
 * `Stock.dividendRatePpm`)를 보유 지분 비율로 지급하고 weeklyProfit 을
 * 리셋한다 (docs/design/08-stock.md §배당 시스템).
 *
 * 핵심 결정 (블루프린트 확정, weeklySettlement.ts 패턴 복제):
 *  - **멱등성 (D14)**: `StockDividend(stockId, weekStart)` unique 가 앵커.
 *    종목별 트랜잭션 안에서 헤더 삽입이 충돌(P2002)하면 그 종목의 지급·리셋
 *    전체가 롤백된다 — 잡을 2회 실행해도 종목당 1회만 지급된다.
 *  - **종목별 개별 트랜잭션**: 한 종목의 실패가 다른 종목 배당을 막지 않는다.
 *    예기치 못한 오류는 `failures` 로 수집하고 계속 진행한다.
 *  - **지급 경로**: `RewardService.grant`(MONEY) — 배당은 XP 이벤트가 아니다
 *    (docs/design/09-level-xp.md §이벤트별 XP 에 배당 없음). 지급 건마다
 *    `TradeLog(kind=DIVIDEND, fromUserId=null, toUserId=보유자)` 기록.
 *  - **weeklyProfit 리셋**: 배당 지급 여부와 무관하게(보유자 0·배당 0 포함)
 *    주간 윈도가 닫히면 0 으로 리셋한다 — D2 "배당·주간수익 리셋" 단일 잡.
 *
 * 참조: docs/design/08-stock.md §배당 시스템, GitHub #18
 */

import type { PrismaClient } from '@idle/database'
import { computeDividendPerShare, kstSettlementWindow } from '@idle/game-core'
import { isUniqueViolation, runInTx } from './base'
import { RewardService } from './reward'
import { recordStockTrade } from './tradeLog'

/** `StockDividendService.settleDividends` 옵션. */
export interface SettleDividendsOptions {
  /** 기준 시각 주입 — 윈도 경계 테스트용. 생략 시 호출 시각. */
  readonly now?: Date
}

/** `settleDividends` 결과 — 로깅·관측용 요약. */
export interface SettleDividendsResult {
  /** 정산 대상 주의 시작 (직전 일요일 00:00 KST 의 UTC 순간) — 멱등 앵커 키. */
  readonly weekStart: Date
  /** 이번 실행에서 배당이 정산된 종목 수. */
  readonly settledStocks: number
  /** 이미 정산돼 건너뛴 종목 수 (멱등 재실행 등). */
  readonly skippedStocks: number
  /** 총 지급 배당금 합. */
  readonly totalPaid: bigint
  /**
   * 정산에 실패한 종목 목록 (P2002 멱등 스킵 제외 — 예기치 못한 오류).
   * 잡은 계속 진행되고 실패 종목은 다음 실행(멱등)에서 재시도된다.
   * 호출자(스케줄 태스크)가 이 목록을 로깅한다 — 서비스는 로거에 의존하지
   * 않는다 (weeklySettlement.ts 관례).
   */
  readonly failures: ReadonlyArray<{
    readonly stockId: string
    readonly message: string
  }>
}

/** 종목 한 건의 정산 결과 (내부). null 이면 스킵(중복 정산·종목 소멸). */
interface SettleStockOutcome {
  readonly totalPaid: bigint
}

export const StockDividendService = {
  /**
   * 전 상장 종목의 주간 배당을 정산한다 (주간 잡 전용 — 멱등).
   *
   * 흐름:
   *  1. 윈도 확정 — `kstSettlementWindow(now).start` 가 `weekStart` 앵커
   *     (weeklySettlement.ts 와 동일한 U-6 경계).
   *  2. 기정산 종목(StockDividend where weekStart) 배치 조회 — 멱등 스킵.
   *  3. 종목별 **개별 트랜잭션**으로 배당 (D14):
   *     주당 배당금(`computeDividendPerShare`) → 보유자별
   *     `주당 배당금 × 보유 주수` 지급 + TradeLog(DIVIDEND) →
   *     `weeklyProfit = 0` 리셋 → 헤더 삽입(P2002 → 멱등 스킵).
   */
  async settleDividends(
    prisma: PrismaClient,
    options?: SettleDividendsOptions
  ): Promise<SettleDividendsResult> {
    const now = options?.now ?? new Date()
    const { start: weekStart } = kstSettlementWindow(now)

    const stocks = await prisma.stock.findMany({ select: { id: true } })

    const settled = await prisma.stockDividend.findMany({
      where: { weekStart },
      select: { stockId: true }
    })
    const settledStockIds = new Set(settled.map((s) => s.stockId))

    let settledStocks = 0
    let skippedStocks = 0
    let totalPaid = 0n
    const failures: Array<{ stockId: string; message: string }> = []

    for (const { id: stockId } of stocks) {
      if (settledStockIds.has(stockId)) {
        skippedStocks += 1
        continue
      }

      let outcome: SettleStockOutcome | null
      try {
        outcome = await settleStock(prisma, stockId, weekStart)
      } catch (err) {
        failures.push({
          stockId,
          message: err instanceof Error ? err.message : String(err)
        })
        continue
      }
      if (outcome === null) {
        skippedStocks += 1
        continue
      }
      settledStocks += 1
      totalPaid += outcome.totalPaid
    }

    return { weekStart, settledStocks, skippedStocks, totalPaid, failures }
  }
} as const

/**
 * 종목 한 건을 단일 트랜잭션으로 배당 정산한다.
 *
 * 헤더 unique(stockId, weekStart) 위반(P2002 — 동시 재실행 경합)은 스킵으로
 * 처리해 잡 전체를 죽이지 않는다. 종목이 조회 후 삭제된 경우도 스킵.
 * 배당 대상 보유 행은 shares > 0 만 — 주당 배당금이 0 이면(주간 수익 극소)
 * 지급 없이 리셋·헤더 기록만 수행한다.
 */
async function settleStock(
  prisma: PrismaClient,
  stockId: string,
  weekStart: Date
): Promise<SettleStockOutcome | null> {
  try {
    return await runInTx(prisma, async (tx) => {
      const stock = await tx.stock.findUnique({
        where: { id: stockId },
        select: {
          id: true,
          guildId: true,
          weeklyProfit: true,
          sharesOutstanding: true,
          dividendRatePpm: true
        }
      })
      if (!stock) return null

      // 주당 배당금 = (weeklyProfit × 배당률) / 발행 주수 (08 §배당 시스템).
      const perShare = computeDividendPerShare({
        weeklyProfit: stock.weeklyProfit,
        sharesOutstanding: stock.sharesOutstanding,
        dividendRatePpm: stock.dividendRatePpm
      })

      let paid = 0n
      if (perShare > 0n) {
        const holdings = await tx.stockHolding.findMany({
          where: { stockId, shares: { gt: 0 } },
          select: { userId: true, shares: true },
          orderBy: { userId: 'asc' } // 결정적 지급 순서 (weeklySettlement 관례)
        })

        for (const holding of holdings) {
          const payout = perShare * BigInt(holding.shares)
          if (payout <= 0n) continue

          // 배당금(MONEY) 지급 — XP 없음 (09 §이벤트별 XP 에 배당 미정의).
          await RewardService.grant(tx, holding.userId, [
            { kind: 'MONEY', amount: payout }
          ])

          // 지급 기록: 시스템→보유자 (fromUserId=null·toUserId=보유자,
          // amount=보유 주수·price=지급액). 활동 서버는 종목 소속 서버 승계.
          await recordStockTrade(tx, {
            fromUserId: null,
            toUserId: holding.userId,
            stockId,
            kind: 'DIVIDEND',
            amount: BigInt(holding.shares),
            price: payout,
            guildId: stock.guildId
          })

          paid += payout
        }
      }

      // 주간 수익 리셋 — 배당 0 이어도 윈도가 닫히면 리셋 (D2 단일 잡).
      await tx.stock.update({
        where: { id: stockId },
        data: { weeklyProfit: 0n }
      })

      // 헤더 = 멱등성 앵커 (D14). 동시 실행이 여기서 P2002 로 충돌하면
      // 위의 지급·리셋까지 전부 롤백된다 (weeklySettlement.ts 패턴).
      await tx.stockDividend.create({
        data: { stockId, weekStart, totalPaid: paid }
      })

      return { totalPaid: paid }
    })
  } catch (err) {
    // P2002(unique 충돌) = 동시 재실행 등으로 이미 정산됨 — 멱등 스킵.
    if (isUniqueViolation(err)) return null
    throw err
  }
}
