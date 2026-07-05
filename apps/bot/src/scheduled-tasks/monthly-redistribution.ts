import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'
import {
  redistributionWeight,
  REDISTRIBUTION_CREDIT_MIN,
  REDISTRIBUTION_VAULT_RATIO_BPS
} from '@idle/game-core'

import { runInTx, type Tx } from '../services/base'

/**
 * 월간 비활성 자산 재분배 cron 패턴 — 매월 1일 00:00 UTC.
 *
 * 봇 퇴장 30일 경과로 동결된 서버 금고(`InactiveServerPool`)를 활성 서버로
 * 가중 분배한다. 근거: docs/design/07-global-system.md §비활성 서버 자산 분배,
 * 이슈 #17 확정 결정 5·8.
 */
export const MONTHLY_REDISTRIBUTION_CRON = '0 0 1 * *'

/** 하루(ms) — 최근 활성 유저 윈도 계산용. */
const DAY_MS = 24 * 60 * 60 * 1000
/** 유저 분배 대상 판정 윈도(일) — 최근 7일 활성 유저. 근거: 07 §비활성 서버 자산 분배 (최근 7일). */
const RECENT_ACTIVE_DAYS = 7
/**
 * 실수 가중치를 BigInt 비례 배분용 정수로 환산할 때의 스케일.
 *
 * 분배액(BigInt)의 정밀도 손실 없이(Number(totalPool) 미사용) 비례 배분하기
 * 위해, 가중치만 정수로 스케일해 `share = totalPool × round(w×S) / round(ΣW×S)`
 * 를 BigInt floor 로 계산한다. 스케일 오차로 생기는 잔여는 최대 가중치 서버로
 * 흡수한다(결정 5). 근거: 이슈 #17 확정 결정 5.
 */
const WEIGHT_SCALE = 1_000_000
/** bps 분모(1만분율). */
const BPS_DENOMINATOR = 10_000n

/** `runMonthlyRedistribution` 결과 요약 — 로깅·관측·테스트용. */
export interface MonthlyRedistributionResult {
  /** 이번에 분배된(클레임된) 동결 금고 총액. */
  readonly totalPool: bigint
  /** 분배 완료 표시(클레임)된 풀 행 수. */
  readonly distributedPools: number
  /** 분배를 받은(금고 증액된) 활성 서버 수. */
  readonly guildShares: number
  /** 실제 지급된 유저 수. */
  readonly userPayouts: number
  /** 개별 지급 트랜잭션이 실패해 미지급으로 남은 수신 길드 id 목록. */
  readonly failedGuildIds: ReadonlyArray<string>
}

/** 분배 없음(빈 풀·수혜 서버 없음) 결과. */
function emptyResult(totalPool: bigint): MonthlyRedistributionResult {
  return {
    totalPool,
    distributedPools: 0,
    guildShares: 0,
    userPayouts: 0,
    failedGuildIds: []
  }
}

/**
 * 서버의 최근 7일 활성 distinct 유저 중 **실존하는** User id 를 반환한다.
 *
 * `GuildDailyActivity` 는 FK 가 없어 유저 행 존재를 보장하지 않으므로, 화폐
 * 보존을 위해 실제 User 행이 있는 id 만 지급 대상으로 남긴다.
 */
async function distinctRecentUsers(
  tx: Tx,
  guildId: string,
  now: Date
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - RECENT_ACTIVE_DAYS * DAY_MS)
  const rows = await tx.guildDailyActivity.groupBy({
    by: ['userId'],
    where: { guildId, date: { gte: cutoff } }
  })
  const ids = rows.map((r) => r.userId)
  if (ids.length === 0) return []
  const existing = await tx.user.findMany({
    where: { id: { in: ids } },
    select: { id: true }
  })
  return existing.map((u) => u.id)
}

/**
 * 단일 수신 길드에 배정된 share 를 개별 트랜잭션으로 지급한다.
 *
 * share 의 70% → 서버 금고, 30% → 최근 7일 활성 유저 균등 지급. 활성 유저 0명
 * 이거나 1인당 배분액이 0이면 100% 금고. 유저 분배 나머지·미지급분은 서버 금고로.
 * 풀은 이미 클레임(마킹)된 상태이므로 이 tx 는 순수 지급만 담당한다.
 *
 * @returns 이 길드에서 실제 지급된 유저 수.
 */
async function payoutGuildShare(
  prisma: PrismaClient,
  guildId: string,
  share: bigint,
  now: Date
): Promise<number> {
  return runInTx(prisma, async (tx) => {
    let vaultPortion =
      (share * BigInt(REDISTRIBUTION_VAULT_RATIO_BPS)) / BPS_DENOMINATOR
    const userPortion = share - vaultPortion
    let userPayouts = 0

    if (userPortion > 0n) {
      const activeUserIds = await distinctRecentUsers(tx, guildId, now)
      if (activeUserIds.length === 0) {
        // 활성 유저 없음 → 100% 금고 (결정 5).
        vaultPortion += userPortion
      } else {
        const perUser = userPortion / BigInt(activeUserIds.length)
        if (perUser > 0n) {
          const res = await tx.user.updateMany({
            where: { id: { in: activeUserIds } },
            data: { money: { increment: perUser } }
          })
          userPayouts = res.count
          // 정수 나눗셈 잔여(및 혹시 모를 미매칭분)는 서버 금고로.
          vaultPortion += userPortion - perUser * BigInt(res.count)
        } else {
          // 1인당 배분액이 0(유저 수 > userPortion) → 전액 금고.
          vaultPortion += userPortion
        }
      }
    }

    await tx.guild.update({
      where: { id: guildId },
      data: { vault: { increment: vaultPortion } }
    })
    return userPayouts
  })
}

/**
 * 월간 비활성 자산 재분배 위임 로직 (스케줄 피스와 분리해 단위 테스트 가능).
 *
 * **선(先)클레임 구조** — 과거 전체를 단일 거대 트랜잭션으로 처리해 eligible 서버가
 * 늘면 10s timeout(P2028, 재시도 불가)으로 매월 전량 실패하던 문제를 해소한다:
 *
 *  1. **tx0(클레임)**: 미분배 풀(`distributedAt=null`)을 조회해 `totalPool` 확정 후,
 *     같은 tx 에서 해당 행을 `distributedAt=now` 로 원자 마킹한다. 단, 수혜 자격
 *     서버(활성 & 신뢰도 ≥ 300)가 없으면 풀을 **보존**(마킹 안 함)하고 다음 달
 *     재시도한다.
 *  2. **tx 밖(계산)**: eligible 길드 조회 → 가중치 `weight = weeklyDAU + ln(vault+1)`
 *     → `share_i = floor(totalPool × w_i / ΣW)`. 총가중치 0이면 균등 폴백, 정수
 *     나눗셈 잔여는 최대 가중치 서버로 흡수(기존 WEIGHT_SCALE 로직 유지).
 *  3. **길드별 개별 tx(지급)**: 각 share 를 70/30 으로 지급(`payoutGuildShare`).
 *     실패한 길드는 로그·`failedGuildIds` 에 남기고 계속 진행한다.
 *
 * **트레이드오프**: 풀은 지급 이전에 이미 클레임되므로, 지급 중 크래시가 나도 **이중
 * 지급은 발생하지 않는다**(재실행 시 그 풀은 미분배 대상이 아님). 대신 크래시·개별
 * 실패 시 해당 몫은 **미지급분으로 유실**될 수 있다(수동 관측·정정 대상). 매월 전량
 * 실패보다 부분 유실이 낫다는 판단에 따른 의도된 절충이다.
 *
 * @param now 기준 시각(테스트 주입, 생략 시 호출 시각).
 */
export async function runMonthlyRedistribution(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<MonthlyRedistributionResult> {
  // (1) tx0 — 풀 조회 + eligible 존재 확인 + 원자 클레임(마킹).
  const claim = await runInTx(prisma, async (tx) => {
    const pools = await tx.inactiveServerPool.findMany({
      where: { distributedAt: null },
      select: { id: true, frozenAmount: true }
    })
    const totalPool = pools.reduce((sum, p) => sum + p.frozenAmount, 0n)
    if (pools.length === 0 || totalPool <= 0n) {
      return { claimed: false, totalPool: 0n, poolCount: 0 }
    }
    // 수혜 자격 서버가 없으면 클레임하지 않고 풀 보존(다음 달 재시도).
    const eligibleCount = await tx.guild.count({
      where: { leftAt: null, credit: { gte: REDISTRIBUTION_CREDIT_MIN } }
    })
    if (eligibleCount === 0) {
      return { claimed: false, totalPool, poolCount: 0 }
    }
    const poolIds = pools.map((p) => p.id)
    const marked = await tx.inactiveServerPool.updateMany({
      where: { id: { in: poolIds }, distributedAt: null },
      data: { distributedAt: now }
    })
    // 동일 Serializable tx 내 read-then-write 이므로 count 는 poolIds 와 일치한다.
    return { claimed: true, totalPool, poolCount: marked.count }
  })

  if (!claim.claimed) {
    if (claim.totalPool > 0n) {
      container.logger.info(
        `[monthly-redistribution] no eligible guilds; pool preserved total=${claim.totalPool}`
      )
    }
    return emptyResult(claim.totalPool)
  }

  const { totalPool, poolCount } = claim

  // (2) tx 밖 — eligible 조회·가중치·share 계산.
  const eligible = await prisma.guild.findMany({
    where: { leftAt: null, credit: { gte: REDISTRIBUTION_CREDIT_MIN } },
    select: { id: true, weeklyDAU: true, vault: true }
  })
  if (eligible.length === 0) {
    // 클레임 직후 eligible 이 사라진 희귀 경합 — 풀은 이미 마킹되어 이번 달 유실.
    container.logger.error(
      `[monthly-redistribution] eligible vanished after claim; total=${totalPool} left undistributed`
    )
    return {
      totalPool,
      distributedPools: poolCount,
      guildShares: 0,
      userPayouts: 0,
      failedGuildIds: []
    }
  }

  // 가중치 산정 — 총가중치 0(모두 DAU 0·금고 0)이면 균등 폴백.
  const rawWeights = eligible.map((g) =>
    redistributionWeight(g.weeklyDAU, g.vault)
  )
  const rawTotal = rawWeights.reduce((sum, w) => sum + w, 0)
  const useEqual = rawTotal <= 0
  const weights = useEqual ? eligible.map(() => 1) : rawWeights
  const totalWeight = useEqual ? eligible.length : rawTotal

  const scaledTotal = BigInt(Math.round(totalWeight * WEIGHT_SCALE))
  const shares = weights.map(
    (w) => (totalPool * BigInt(Math.round(w * WEIGHT_SCALE))) / scaledTotal
  )
  const distributed = shares.reduce((sum, s) => sum + s, 0n)
  const remainder = totalPool - distributed

  // 최대 가중치 서버 인덱스(정수 나눗셈 잔여 흡수 대상).
  let maxIdx = 0
  for (let i = 1; i < weights.length; i++) {
    if (weights[i] > weights[maxIdx]) maxIdx = i
  }

  // (3) 길드별 개별 tx 지급 — 실패는 로그·failedGuildIds 로 격리하고 계속.
  let guildShares = 0
  let userPayouts = 0
  const failedGuildIds: string[] = []

  for (let i = 0; i < eligible.length; i++) {
    const guild = eligible[i]
    let share = shares[i]
    if (i === maxIdx) share += remainder
    if (share <= 0n) continue

    try {
      const paid = await payoutGuildShare(prisma, guild.id, share, now)
      guildShares += 1
      userPayouts += paid
    } catch (err) {
      failedGuildIds.push(guild.id)
      container.logger.error(
        `[monthly-redistribution] payout failed guild=${guild.id} share=${share}: ${
          err instanceof Error ? err.message : String(err)
        }`
      )
    }
  }

  container.logger.info(
    `[monthly-redistribution] total=${totalPool} pools=${poolCount} ` +
      `guilds=${guildShares} users=${userPayouts} failed=${failedGuildIds.length}`
  )

  return {
    totalPool,
    distributedPools: poolCount,
    guildShares,
    userPayouts,
    failedGuildIds
  }
}

/**
 * 월간 비활성 자산 재분배 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 cron 반복 잡 —
 * 매월 1일 00:00 UTC. 큐 단위 dedup 으로 occurrence 당 1회 실행.
 */
export class MonthlyRedistributionTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      pattern: MONTHLY_REDISTRIBUTION_CRON
    })
  }

  public async run(): Promise<void> {
    await runMonthlyRedistribution(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'monthly-redistribution': never
  }
}
