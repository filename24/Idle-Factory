/**
 * 주간 세금 정산 서비스 v1 (#16).
 *
 * 매주 일요일 00:00 KST(U-6) 기준으로 직전 1주 [일 00:00 KST, 익주 일 00:00 KST)
 * 윈도의 판매 수익을 유저×서버별로 집계해 자산 누진세를 부과하고, 징수액을
 * 해당 서버 `Guild.vault` 에 적립한다 (docs/design/07-global-system.md).
 *
 * 핵심 결정 (#16 확정, JSDoc 로 근거 고정):
 *  - **과세 베이스 = TradeLog.price(gross) 합** — 유저 상점 실판매는 gross 로
 *    기록되어 등록 시점 수수료(taxRate)를 소급 재계산하기 어렵고, 글로벌 판매는
 *    수수료 0 이라 gross=net 이다. net/gross 정합 논점은 #31(밸런스 시뮬레이터)
 *    재검토로 이월한다. 대상 행: kind=MARKET_SELL & price>0 (실판매·글로벌 판매
 *    — price=0 인 취소/만료 회수는 제외, schema `TradeLog` 규약).
 *  - **귀속(D-1)**: 자산은 글로벌 단일, 과세·금고 적립은 `TradeLog.guildId`
 *    (판매가 발생한 서버)별. 이중과세 없음 — 한 거래는 정확히 한 서버(또는
 *    null 버킷)에만 귀속된다.
 *  - **guildId=null 판매분**: 기본 세율(자산 누진, 가산세 0)로 과세하되 금고
 *    적립 없이 WeeklySettlementLine(guildId=null)로만 기록 — 화폐 회수(sink).
 *  - **미납 가드**: 현금 < 세액이면 가능한 만큼만 차감하고 미납 잔액을
 *    `WeeklySettlement.unpaidAmount` 에 기록한다. 납부액의 라인 배분은
 *    guildId 오름차순 → null 버킷 마지막 순서의 결정적 그리디 — 비례 배분의
 *    정수 나머지 문제를 피한다. 신뢰도 패널티는 #17 소관.
 *  - **세금 배분 v1**: 징수액 전액을 해당 서버 금고에 입금. 07 문서의 글로벌
 *    재분배 풀 50% 분리는 월간 재분배 시점 개념으로 #17 에서 다룬다.
 *  - **멱등성**: `WeeklySettlement(userId, weekStart)` unique 가 앵커. 유저별
 *    트랜잭션 안에서 헤더 삽입이 충돌(P2002)하면 그 유저의 과세·적립 전체가
 *    롤백된다 — 잡을 2회 실행해도 유저당 1회만 처리된다.
 *
 * `Guild.taxSurcharge` 는 이 서비스에서 **최초로 실제 세율에 반영**된다
 * (설정 UI 는 #14 에서 선반영: interaction-handlers/selects/guildSettingsTax.ts).
 *
 * 참조: docs/design/07-global-system.md §세금 시스템·§유저 귀속 모델, GitHub #16
 */

import type { PrismaClient } from '@idle/database'
import type { FactoryType, MaterialType } from '@idle/game-core'
import {
  baseTaxRateBps,
  calcWeeklyTax,
  effectiveTaxRateBps,
  evaluateTotalAssets,
  kstSettlementWindow,
  surchargeToBps
} from '@idle/game-core'
import { runInTx } from './base'

/** 하루(ms) — 활동 로그 보존 기간 계산용. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `GuildDailyActivity` 보존 기간 — 2주.
 * 주간 정산이 직전 1주만 읽으므로 2주면 재실행·디버깅 여유가 충분하다 (#16).
 */
export const ACTIVITY_RETENTION_DAYS = 14

/** `WeeklySettlementService.settleWeek` 옵션. */
export interface SettleWeekOptions {
  /** 기준 시각 주입 — 윈도 경계 테스트용. 생략 시 호출 시각. */
  readonly now?: Date
}

/** `settleWeek` 결과 — 로깅·관측용 요약. */
export interface SettleWeekResult {
  /** 정산 윈도 시작 (직전 일요일 00:00 KST 의 UTC 순간). */
  readonly weekStart: Date
  /** 정산 윈도 끝 (이번 일요일 00:00 KST 의 UTC 순간, 미포함). */
  readonly weekEnd: Date
  /** 이번 실행에서 정산된 유저 수. */
  readonly settledUsers: number
  /** 이미 정산돼 건너뛴 유저 수 (멱등 재실행 등). */
  readonly skippedUsers: number
  /** 총 징수 세액 (실납부 합). */
  readonly totalTaxPaid: bigint
  /** 서버 금고 적립 합 (null 버킷 제외). */
  readonly totalVaultDeposited: bigint
  /** 미납 잔액 합. */
  readonly totalUnpaid: bigint
  /** weeklyDAU 가 갱신된 서버 수. */
  readonly dauUpdatedGuilds: number
  /** 정리된 활동 로그 행 수 (보존 2주 초과분). */
  readonly prunedActivityRows: number
  /**
   * 정산에 실패한 유저 목록 (P2002 멱등 스킵 제외 — 예기치 못한 오류).
   * 잡은 계속 진행되고 실패 유저는 다음 실행(멱등)에서 재시도된다.
   * 호출자(스케줄 태스크)가 이 목록을 로깅한다 — 서비스는 로거에 의존하지 않는다.
   */
  readonly failures: ReadonlyArray<{
    readonly userId: string
    readonly message: string
  }>
}

/** 유저×서버 수익 버킷 — 내부 집계용. */
interface RevenueBucket {
  readonly guildId: string | null
  readonly revenue: bigint
}

/** `/server vault` 용 — 서버의 최근 정산 요약. */
export interface GuildSettlementSummary {
  /** 정산 대상 주의 시작 (일요일 00:00 KST 의 UTC 순간). */
  readonly weekStart: Date
  /** 이 서버에서 발생한 주간 판매 수익 합 (gross). */
  readonly salesRevenue: bigint
  /** 이 서버 몫 세액 합. */
  readonly taxDue: bigint
  /** 실제 금고로 적립된 납부 세액 합. */
  readonly taxPaid: bigint
  /** 과세된 유저 수. */
  readonly userCount: number
}

export const WeeklySettlementService = {
  /**
   * 직전 1주 윈도를 정산한다 (주간 잡 전용 — 멱등).
   *
   * 흐름:
   *  1. 윈도 확정 — `kstSettlementWindow(now)` (U-6).
   *  2. `TradeLog` 집계 — kind=MARKET_SELL·price>0·윈도 내 행을
   *     (fromUserId, guildId) 로 groupBy, price 합(gross). 인덱스
   *     `[kind, createdAt]` 이 필터를 커버한다.
   *  3. 시세(총자산 평가용 13행)·관련 서버(가산세)를 1회씩 배치 조회 — N+1 방지.
   *  4. 유저별 **개별 트랜잭션**으로 과세 — 한 유저의 실패가 다른 유저의
   *     정산을 막지 않는다. P2002(동시 재실행 경합)는 멱등 스킵, 그 외
   *     오류는 `failures` 로 수집하고 계속 진행한다. 유저 트랜잭션 내부:
   *     총자산 평가(U-2) → 서버별 유효 세율(누진+가산, cap 40%) → 세액 →
   *     미납 가드 차감 → `Guild.vault` 적립 → 헤더+라인 기록.
   *  5. `GuildDailyActivity` 로 서버별 distinct 유저 수를 세어
   *     `Guild.weeklyDAU` 를 갱신(활동 없는 서버는 0)하고 2주 초과분을 정리.
   *
   * 유저 자산 스냅샷·시세는 실행 시점 기준이다 — 윈도 종료 후 잡 실행까지의
   * 자산 변동은 v1 에서 허용한다 ("정산 직전 자산 이동 불가" 회피 방지책은
   * 07 문서상 후속 스코프).
   */
  async settleWeek(
    prisma: PrismaClient,
    options?: SettleWeekOptions
  ): Promise<SettleWeekResult> {
    const now = options?.now ?? new Date()
    const { start: weekStart, end: weekEnd } = kstSettlementWindow(now)

    // 1) 유저×서버 판매 수익 집계 (gross).
    const grouped = await prisma.tradeLog.groupBy({
      by: ['fromUserId', 'guildId'],
      where: {
        kind: 'MARKET_SELL',
        price: { gt: 0n },
        fromUserId: { not: null },
        createdAt: { gte: weekStart, lt: weekEnd }
      },
      _sum: { price: true }
    })

    // 유저별 버킷으로 재구성.
    const byUser = new Map<string, RevenueBucket[]>()
    for (const row of grouped) {
      if (!row.fromUserId) continue
      const revenue = row._sum.price ?? 0n
      if (revenue <= 0n) continue
      const buckets = byUser.get(row.fromUserId) ?? []
      buckets.push({ guildId: row.guildId, revenue })
      byUser.set(row.fromUserId, buckets)
    }

    // 2) 배치 조회 — 시세(자산 평가), 서버 가산세, 기정산 유저(멱등 스킵).
    const priceRows = await prisma.globalMarketPrice.findMany({
      select: { material: true, currentPrice: true }
    })
    const prices = new Map<MaterialType, bigint>(
      priceRows.map((r) => [r.material as MaterialType, r.currentPrice])
    )

    const guildIds = [
      ...new Set(
        grouped.map((r) => r.guildId).filter((id): id is string => id !== null)
      )
    ]
    const guilds = await prisma.guild.findMany({
      where: { id: { in: guildIds } },
      select: { id: true, taxSurcharge: true }
    })
    const surchargeBpsByGuild = new Map(
      guilds.map((g) => [g.id, surchargeToBps(g.taxSurcharge)])
    )

    const settled = await prisma.weeklySettlement.findMany({
      where: { weekStart },
      select: { userId: true }
    })
    const settledUserIds = new Set(settled.map((s) => s.userId))

    // 3) 유저별 정산 — 개별 격리. 한 유저의 예기치 못한 실패는 failures 로
    //    수집만 하고 나머지 유저를 계속 처리한다(재실행 멱등이라 재시도 안전).
    let settledUsers = 0
    let skippedUsers = 0
    let totalTaxPaid = 0n
    let totalVaultDeposited = 0n
    let totalUnpaid = 0n
    const failures: Array<{ userId: string; message: string }> = []

    for (const [userId, buckets] of byUser) {
      if (settledUserIds.has(userId)) {
        skippedUsers += 1
        continue
      }

      let outcome: SettleUserOutcome | null
      try {
        outcome = await settleUser(prisma, {
          userId,
          buckets,
          weekStart,
          prices,
          surchargeBpsByGuild
        })
      } catch (err) {
        failures.push({
          userId,
          message: err instanceof Error ? err.message : String(err)
        })
        continue
      }
      if (outcome === null) {
        skippedUsers += 1
        continue
      }
      settledUsers += 1
      totalTaxPaid += outcome.taxPaid
      totalVaultDeposited += outcome.vaultDeposited
      totalUnpaid += outcome.unpaid
    }

    // 4) weeklyDAU 갱신 + 활동 로그 정리.
    const { dauUpdatedGuilds, prunedActivityRows } = await refreshWeeklyDau(
      prisma,
      weekStart,
      weekEnd
    )

    return {
      weekStart,
      weekEnd,
      settledUsers,
      skippedUsers,
      totalTaxPaid,
      totalVaultDeposited,
      totalUnpaid,
      dauUpdatedGuilds,
      prunedActivityRows,
      failures
    }
  },

  /**
   * `/server vault` 용 — 서버의 가장 최근 주간 정산 요약을 조회한다 (read-only).
   *
   * `WeeklySettlementLine` 비정규화 컬럼(guildId, weekStart)의
   * `[guildId, weekStart]` 인덱스를 타므로 헤더 조인이 필요 없다.
   * 정산 이력이 없으면 null.
   */
  async guildSummary(
    prisma: PrismaClient,
    guildId: string
  ): Promise<GuildSettlementSummary | null> {
    const latest = await prisma.weeklySettlementLine.findFirst({
      where: { guildId },
      orderBy: { weekStart: 'desc' },
      select: { weekStart: true }
    })
    if (!latest) return null

    const agg = await prisma.weeklySettlementLine.aggregate({
      where: { guildId, weekStart: latest.weekStart },
      _sum: { salesRevenue: true, taxDue: true, taxPaid: true },
      _count: { _all: true }
    })
    return {
      weekStart: latest.weekStart,
      salesRevenue: agg._sum.salesRevenue ?? 0n,
      taxDue: agg._sum.taxDue ?? 0n,
      taxPaid: agg._sum.taxPaid ?? 0n,
      userCount: agg._count._all
    }
  }
} as const

/** `settleUser` 입력 — 배치 조회 스냅샷 포함. */
interface SettleUserInput {
  readonly userId: string
  readonly buckets: readonly RevenueBucket[]
  readonly weekStart: Date
  readonly prices: ReadonlyMap<MaterialType, bigint>
  readonly surchargeBpsByGuild: ReadonlyMap<string, number>
}

/** 유저 한 명의 정산 결과 (내부). null 이면 스킵(유저 소멸·중복 정산). */
interface SettleUserOutcome {
  readonly taxPaid: bigint
  readonly vaultDeposited: bigint
  readonly unpaid: bigint
}

/**
 * 유저 한 명을 단일 트랜잭션으로 정산한다.
 *
 * 헤더 unique(userId, weekStart) 위반(P2002 — 동시 재실행 경합)은 스킵으로
 * 처리해 잡 전체를 죽이지 않는다. 유저가 집계 후 삭제된 경우도 스킵.
 */
async function settleUser(
  prisma: PrismaClient,
  input: SettleUserInput
): Promise<SettleUserOutcome | null> {
  const { userId, buckets, weekStart, prices, surchargeBpsByGuild } = input

  try {
    return await runInTx(prisma, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, money: true }
      })
      if (!user) return null

      // 총자산 평가 (U-2): 현금 + 창고×시세 + 공장 누적 투자비.
      const warehouse = await tx.warehouse.findUnique({
        where: { userId },
        select: { stacks: { select: { material: true, count: true } } }
      })
      const factories = await tx.factory.findMany({
        where: { userId },
        select: { type: true, grade: true }
      })
      const totalAssets = evaluateTotalAssets({
        money: user.money,
        stacks: (warehouse?.stacks ?? []).map((s) => ({
          material: s.material as MaterialType,
          count: s.count
        })),
        prices,
        factories: factories.map((f) => ({
          type: f.type as FactoryType,
          grade: f.grade
        }))
      })
      const baseBps = baseTaxRateBps(totalAssets)

      // 서버별 세액 산정 — guildId 오름차순, null 버킷은 마지막 (결정적 배분 순서).
      const ordered = [...buckets].sort((a, b) => {
        if (a.guildId === null) return 1
        if (b.guildId === null) return -1
        return a.guildId < b.guildId ? -1 : a.guildId > b.guildId ? 1 : 0
      })

      const lines = ordered.map((bucket) => {
        // TradeLog.guildId 는 FK 라 서버 행이 존재하지만, 방어적으로 미조회
        // 서버는 가산세 0(기본 세율)으로 처리한다.
        const surchargeBps = bucket.guildId
          ? (surchargeBpsByGuild.get(bucket.guildId) ?? 0)
          : 0
        const appliedBps = effectiveTaxRateBps(totalAssets, surchargeBps)
        return {
          guildId: bucket.guildId,
          revenue: bucket.revenue,
          appliedBps,
          taxDue: calcWeeklyTax(bucket.revenue, appliedBps)
        }
      })

      const totalRevenue = lines.reduce((sum, l) => sum + l.revenue, 0n)
      const taxDue = lines.reduce((sum, l) => sum + l.taxDue, 0n)

      // 미납 가드 — 현금 한도 내에서만 차감.
      const paidTotal = user.money < taxDue ? user.money : taxDue
      const unpaid = taxDue - paidTotal

      // 납부액을 라인에 그리디 배분 (guildId asc → null 마지막).
      let paidLeft = paidTotal
      const allocated = lines.map((line) => {
        const linePaid = paidLeft < line.taxDue ? paidLeft : line.taxDue
        paidLeft -= linePaid
        return { ...line, taxPaid: linePaid }
      })

      if (paidTotal > 0n) {
        await tx.user.update({
          where: { id: userId },
          data: { money: { decrement: paidTotal } }
        })
      }

      // 서버 금고 적립 — null 버킷은 적립 없음(화폐 sink).
      let vaultDeposited = 0n
      for (const line of allocated) {
        if (!line.guildId || line.taxPaid <= 0n) continue
        await tx.guild.update({
          where: { id: line.guildId },
          data: { vault: { increment: line.taxPaid } }
        })
        vaultDeposited += line.taxPaid
      }

      // 헤더 + 라인 기록. 헤더 unique(userId, weekStart)가 멱등성 앵커 —
      // 동시 실행이 여기서 P2002 로 충돌하면 위의 차감·적립까지 전부 롤백된다.
      await tx.weeklySettlement.create({
        data: {
          userId,
          weekStart,
          salesRevenue: totalRevenue,
          taxDue,
          taxPaid: paidTotal,
          unpaidAmount: unpaid,
          totalAssets,
          baseTaxBps: baseBps,
          lines: {
            create: allocated.map((line) => ({
              guildId: line.guildId,
              weekStart,
              salesRevenue: line.revenue,
              taxDue: line.taxDue,
              taxPaid: line.taxPaid,
              appliedBps: line.appliedBps
            }))
          }
        }
      })

      return { taxPaid: paidTotal, vaultDeposited, unpaid }
    })
  } catch (err) {
    // P2002(unique 충돌) = 동시 재실행 등으로 이미 정산됨 — 멱등 스킵.
    if (isUniqueViolation(err)) return null
    throw err
  }
}

/**
 * 주간 DAU 를 갱신하고 오래된 활동 로그를 정리한다.
 *
 * distinct 유저 수는 `GuildDailyActivity` 의 (guildId, userId) unique 성질을
 * 이용해 groupBy 결과를 서버별로 세어 구한다 — raw SQL COUNT(DISTINCT) 없이
 * 타입 안전하게 처리(서버×유저 조합 수는 주간 윈도에서 충분히 작다).
 * 활동이 없던 서버는 0 으로 리셋한다 (07 §신뢰도 변동 — DAU 0 → 감쇠 입력).
 */
async function refreshWeeklyDau(
  prisma: PrismaClient,
  weekStart: Date,
  weekEnd: Date
): Promise<{ dauUpdatedGuilds: number; prunedActivityRows: number }> {
  const pairs = await prisma.guildDailyActivity.groupBy({
    by: ['guildId', 'userId'],
    where: { date: { gte: weekStart, lt: weekEnd } }
  })
  const dauByGuild = new Map<string, number>()
  for (const pair of pairs) {
    dauByGuild.set(pair.guildId, (dauByGuild.get(pair.guildId) ?? 0) + 1)
  }

  const { count: dauUpdatedGuilds } = await runInTx(prisma, async (tx) => {
    // 활동 없는 서버 포함 전체 리셋 후, 활동 서버만 실측값으로 갱신.
    await tx.guild.updateMany({ data: { weeklyDAU: 0 } })
    for (const [guildId, dau] of dauByGuild) {
      await tx.guild.updateMany({
        where: { id: guildId },
        data: { weeklyDAU: dau }
      })
    }
    return { count: dauByGuild.size }
  })

  const pruneBefore = new Date(
    weekEnd.getTime() - ACTIVITY_RETENTION_DAYS * DAY_MS
  )
  const pruned = await prisma.guildDailyActivity.deleteMany({
    where: { date: { lt: pruneBefore } }
  })

  return { dauUpdatedGuilds, prunedActivityRows: pruned.count }
}

/** Prisma P2002(unique constraint violation) 판별 — base.ts 의 덕타이핑 관례. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === 'P2002'
  )
}
