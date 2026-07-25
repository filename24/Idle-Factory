import { unstable_cache } from 'next/cache'
import { db } from '../db'

/**
 * 랭킹 데이터 접근 계층 (User·Guild).
 *
 * BigInt(money/xp/vault)는 이 경계에서 문자열로 직렬화해 라우트 핸들러(JSON)와
 * RSC 양쪽이 동일한 DTO를 소비하도록 한다. 무거운 집계 쿼리는 `unstable_cache`
 * 로 60초 캐시(#20 §캐싱 `revalidate = 60`)한다 — 세션 의존 하이라이트는 페이지에서
 * 요청마다 계산하므로 캐시 대상에서 제외된다.
 */

/** 유저 랭킹 정렬 기준. */
export type UserSort = 'money' | 'level'
/** 서버 랭킹 정렬 기준. */
export type GuildSort = 'vault' | 'weeklyDAU'

/** 페이지당 항목 수. */
export const RANKING_PAGE_SIZE = 20
/** 랭킹 캐시 TTL(초). 근거: #20 §캐싱. */
export const RANKING_REVALIDATE_SECONDS = 60
/**
 * skip 폭주/딥 페이지네이션 남용 방지용 페이지 상한.
 * 20개/페이지 × 1000 = 20,000위까지 — Discord 게임 랭킹으로 충분하며 대형 offset 스캔을 차단한다.
 */
const MAX_PAGE = 1000

/** 유저 랭킹 한 행. */
export interface UserRankEntry {
  readonly rank: number
  readonly id: string
  readonly nickname: string | null
  readonly level: number
  readonly xp: string
  readonly money: string
}

/** 서버 랭킹 한 행. */
export interface GuildRankEntry {
  readonly rank: number
  readonly id: string
  readonly name: string
  readonly vault: string
  readonly weeklyDAU: number
  readonly credit: number
}

/** 페이지네이션 랭킹 결과 봉투. */
export interface RankingResult<T> {
  readonly entries: T[]
  readonly total: number
  readonly page: number
  readonly pageSize: number
  readonly totalPages: number
  readonly sort: string
}

/** 임의 입력 → 허용된 유저 정렬값 (기본 money). */
export function normalizeUserSort(value: string | null | undefined): UserSort {
  return value === 'level' ? 'level' : 'money'
}

/** 임의 입력 → 허용된 서버 정렬값 (기본 vault). */
export function normalizeGuildSort(value: string | null | undefined): GuildSort {
  return value === 'weeklyDAU' ? 'weeklyDAU' : 'vault'
}

/** 임의 입력 → 1 이상 MAX_PAGE 이하의 정수 페이지 번호 (기본 1). */
export function normalizePage(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 1) return 1
  return Math.min(Math.floor(n), MAX_PAGE)
}

const fetchUserRanking = unstable_cache(
  async (sort: UserSort, page: number): Promise<RankingResult<UserRankEntry>> => {
    const skip = (page - 1) * RANKING_PAGE_SIZE
    const orderBy =
      sort === 'level'
        ? [{ level: 'desc' as const }, { xp: 'desc' as const }, { id: 'asc' as const }]
        : [{ money: 'desc' as const }, { id: 'asc' as const }]
    const [total, rows] = await Promise.all([
      db.user.count(),
      db.user.findMany({
        orderBy,
        skip,
        take: RANKING_PAGE_SIZE,
        select: { id: true, nickname: true, level: true, xp: true, money: true },
      }),
    ])
    const entries: UserRankEntry[] = rows.map((r, i) => ({
      rank: skip + i + 1,
      id: r.id,
      nickname: r.nickname,
      level: r.level,
      xp: r.xp.toString(),
      money: r.money.toString(),
    }))
    return {
      entries,
      total,
      page,
      pageSize: RANKING_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / RANKING_PAGE_SIZE)),
      sort,
    }
  },
  ['ranking-users'],
  { revalidate: RANKING_REVALIDATE_SECONDS, tags: ['ranking-users'] },
)

const fetchGuildRanking = unstable_cache(
  async (sort: GuildSort, page: number): Promise<RankingResult<GuildRankEntry>> => {
    const skip = (page - 1) * RANKING_PAGE_SIZE
    // 봇이 나간 서버(leftAt != null)는 랭킹에서 제외한다.
    const where = { leftAt: null }
    const orderBy =
      sort === 'weeklyDAU'
        ? [{ weeklyDAU: 'desc' as const }, { vault: 'desc' as const }, { id: 'asc' as const }]
        : [{ vault: 'desc' as const }, { weeklyDAU: 'desc' as const }, { id: 'asc' as const }]
    const [total, rows] = await Promise.all([
      db.guild.count({ where }),
      db.guild.findMany({
        where,
        orderBy,
        skip,
        take: RANKING_PAGE_SIZE,
        select: { id: true, name: true, vault: true, weeklyDAU: true, credit: true },
      }),
    ])
    const entries: GuildRankEntry[] = rows.map((r, i) => ({
      rank: skip + i + 1,
      id: r.id,
      name: r.name,
      vault: r.vault.toString(),
      weeklyDAU: r.weeklyDAU,
      credit: r.credit,
    }))
    return {
      entries,
      total,
      page,
      pageSize: RANKING_PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / RANKING_PAGE_SIZE)),
      sort,
    }
  },
  ['ranking-guilds'],
  { revalidate: RANKING_REVALIDATE_SECONDS, tags: ['ranking-guilds'] },
)

/**
 * 유저 랭킹 페이지 조회 (입력 정규화 후 캐시 계층 호출).
 * @param rawSort 정렬 기준 (money|level, 그 외 → money)
 * @param rawPage 페이지 (1-base, 유효하지 않으면 1)
 */
export async function getUserRanking(
  rawSort: string | null | undefined,
  rawPage: string | number | null | undefined,
): Promise<RankingResult<UserRankEntry>> {
  return fetchUserRanking(normalizeUserSort(rawSort), normalizePage(rawPage))
}

/**
 * 서버 랭킹 페이지 조회 (입력 정규화 후 캐시 계층 호출).
 * @param rawSort 정렬 기준 (vault|weeklyDAU, 그 외 → vault)
 * @param rawPage 페이지 (1-base, 유효하지 않으면 1)
 */
export async function getGuildRanking(
  rawSort: string | null | undefined,
  rawPage: string | number | null | undefined,
): Promise<RankingResult<GuildRankEntry>> {
  return fetchGuildRanking(normalizeGuildSort(rawSort), normalizePage(rawPage))
}
