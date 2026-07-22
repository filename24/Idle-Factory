import { cache } from 'react'
import { unstable_cache } from 'next/cache'
import { getCreditTier, type CreditTier } from '@idle/game-core'
import { db } from '../db'
import { toKstIso, toKstDateString } from '../kst-date'

/**
 * 서버별 통계 대시보드 데이터 접근 계층.
 *
 * 금고 잔액·세율·신뢰도(현재 스냅샷) + DAU 추이(GuildDailyActivity 일별 집계) +
 * 주간 정산 히스토리(WeeklySettlementLine 주별 합산)를 조립한다.
 * BigInt 는 문자열, 날짜는 ISO 문자열로 직렬화한다. 근거: #20 §서버별 통계 대시보드.
 */

/** DAU 추이 조회 일수. */
const DAU_TREND_DAYS = 14
/** 정산 히스토리 최대 주 수. */
const SETTLEMENT_WEEKS = 12
/** 통계 캐시 TTL(초). */
export const GUILD_STATS_REVALIDATE_SECONDS = 60
/** Discord snowflake 형식 가드 (숫자 1~20자리). */
const SNOWFLAKE_RE = /^\d{1,20}$/

/** DAU 추이 한 점 (하루). */
export interface DauPoint {
  /** KST 달력일 ISO 날짜 (YYYY-MM-DD). */
  readonly date: string
  /** 해당일 활동 유저 수 (distinct). */
  readonly count: number
}

/** 주간 정산 히스토리 한 줄. */
export interface SettlementPoint {
  /** 정산 주 시작 — KST 기준 ISO datetime. */
  readonly weekStart: string
  /** 금고 적립분(납부 세액 합). */
  readonly taxPaid: string
  /** 과세 대상 판매 수익 합(gross). */
  readonly salesRevenue: string
}

/** 서버 통계 전체 DTO. */
export interface GuildStats {
  readonly id: string
  readonly name: string
  readonly vault: string
  readonly weeklyDAU: number
  /** 관리자 가산세 비율 (0~0.20). */
  readonly taxSurcharge: number
  readonly credit: number
  readonly creditTier: CreditTier
  readonly factoryCount: number
  /** 누적 금고 적립 세액(전 기간). */
  readonly totalTaxCollected: string
  readonly dauTrend: DauPoint[]
  readonly settlements: SettlementPoint[]
}

const fetchGuildStats = unstable_cache(
  async (guildId: string): Promise<GuildStats | null> => {
    const guild = await db.guild.findUnique({
      where: { id: guildId },
      select: {
        id: true,
        name: true,
        vault: true,
        weeklyDAU: true,
        taxSurcharge: true,
        credit: true,
      },
    })
    if (!guild) return null

    const since = new Date(Date.now() - DAU_TREND_DAYS * 86_400_000)
    const [dauRows, settlementRows, taxAgg, factoryCount] = await Promise.all([
      db.guildDailyActivity.groupBy({
        by: ['date'],
        where: { guildId, date: { gte: since } },
        _count: { _all: true },
        orderBy: { date: 'asc' },
      }),
      db.weeklySettlementLine.groupBy({
        by: ['weekStart'],
        where: { guildId },
        _sum: { taxPaid: true, salesRevenue: true },
        orderBy: { weekStart: 'desc' },
        take: SETTLEMENT_WEEKS,
      }),
      db.weeklySettlementLine.aggregate({
        where: { guildId },
        _sum: { taxPaid: true },
      }),
      db.factory.count({ where: { guildId } }),
    ])

    const dauTrend: DauPoint[] = dauRows.map((r) => ({
      date: toKstDateString(r.date),
      count: r._count._all,
    }))

    // 최신순으로 가져온 뒤 차트/테이블용으로 오래된→최신 정렬 복원.
    const settlements: SettlementPoint[] = settlementRows
      .map((r) => ({
        weekStart: toKstIso(r.weekStart),
        taxPaid: (r._sum.taxPaid ?? 0n).toString(),
        salesRevenue: (r._sum.salesRevenue ?? 0n).toString(),
      }))
      .reverse()

    return {
      id: guild.id,
      name: guild.name,
      vault: guild.vault.toString(),
      weeklyDAU: guild.weeklyDAU,
      taxSurcharge: guild.taxSurcharge,
      credit: guild.credit,
      creditTier: getCreditTier(guild.credit),
      factoryCount,
      totalTaxCollected: (taxAgg._sum.taxPaid ?? 0n).toString(),
      dauTrend,
      settlements,
    }
  },
  ['guild-stats'],
  { revalidate: GUILD_STATS_REVALIDATE_SECONDS, tags: ['guild-stats'] },
)

/**
 * 서버 통계 조회. 형식이 잘못됐거나 존재하지 않는 서버는 null.
 *
 * React `cache` 로 감싸 같은 요청 렌더 내 중복 호출(generateMetadata + 페이지 본문)이
 * 하나의 실행을 공유하게 한다. 60초 캐시는 내부 `fetchGuildStats`(unstable_cache)가 담당.
 *
 * @param guildId Discord snowflake
 * @returns 통계 DTO 또는 null(→ 페이지에서 notFound 처리)
 */
export const getGuildStats = cache(async (guildId: string): Promise<GuildStats | null> => {
  if (!SNOWFLAKE_RE.test(guildId)) return null
  return fetchGuildStats(guildId)
})
