import { container } from '@sapphire/framework'
import { ScheduledTask } from '@sapphire/plugin-scheduled-tasks'
import type { PrismaClient } from '@idle/database'
import {
  applyCreditDelta,
  INACTIVE_DAYS,
  UNPAID_DAILY_PENALTY
} from '@idle/game-core'

import { runInTx } from '../services/base'
import { AnnounceService } from '../services/announce'
import { simpleContainer, V2_ACCENT } from '../utils/ComponentsV2'

/**
 * 일일 글로벌 잡 cron 패턴 — 매일 15:00 UTC = KST 00:00 (U-6).
 *
 * 세금 미납 신뢰도 패널티(−10)와 비활성 서버(30일) 금고 동결을 수행한다.
 * 근거: docs/design/07-global-system.md §신뢰도 변동·§비활성 서버 자산 분배,
 *      이슈 #17 확정 결정 2·8.
 */
export const DAILY_GLOBAL_CRON = '0 15 * * *'

/** 하루(ms) — 비활성 경과일 계산용. */
const DAY_MS = 24 * 60 * 60 * 1000

/** `runDailyGlobal` 결과 요약 — 로깅·관측·테스트용. */
export interface DailyGlobalResult {
  /** 미납 패널티(−10)가 적용된 서버 수. */
  readonly penalizedGuilds: number
  /** 비활성 금고가 동결된 서버 수. */
  readonly collectedGuilds: number
  /** 이번 실행에서 동결된 금고 합계. */
  readonly frozenTotal: bigint
}

/**
 * 세금 미납 서버에 일일 신뢰도 패널티(−10)를 적용한다 (결정 2).
 *
 * **길드 귀속 판정**: `WeeklySettlement` 헤더의 `guildId` 는 #16 에서 deprecated
 * 되어 신규 행은 항상 null 이다. 서버별 미납은 `WeeklySettlementLine` 단위로만
 * 존재하므로, "가장 최근 정산 주(max weekStart)의 `WeeklySettlementLine` 중
 * `guildId != null` 이고 `taxDue > taxPaid`(미납 발생)인 라인이 있는 서버" 를
 * 미납 귀속 서버로 판정한다. 이는 라인 단위 실납/미납 스냅샷에 대한 가장 충실한
 * v0 매핑이다.
 *
 * 신뢰도는 `applyCreditDelta` 로 0~2000 clamp. 멱등하지 않으므로(같은 날 재실행
 * 시 −20) 스케줄러 큐 occurrence dedup 에 의존한다.
 *
 * @returns 실제 신뢰도가 갱신된(패널티가 적용된) 서버 목록. 각 항목은 길드 ID 와
 *          패널티 적용 **후** 신뢰도(`credit`)를 담는다. 이미 하한(0)이라 쓰기를
 *          생략한 서버는 포함하지 않는다.
 */
export async function applyUnpaidPenalty(
  prisma: PrismaClient
): Promise<ReadonlyArray<{ guildId: string; credit: number }>> {
  const latest = await prisma.weeklySettlementLine.findFirst({
    orderBy: { weekStart: 'desc' },
    select: { weekStart: true }
  })
  if (!latest) return []

  const lines = await prisma.weeklySettlementLine.findMany({
    where: { weekStart: latest.weekStart, guildId: { not: null } },
    select: { guildId: true, taxDue: true, taxPaid: true }
  })

  const unpaidGuildIds = new Set<string>()
  for (const line of lines) {
    if (line.guildId && line.taxDue > line.taxPaid) {
      unpaidGuildIds.add(line.guildId)
    }
  }
  if (unpaidGuildIds.size === 0) return []

  const ids = [...unpaidGuildIds]
  return runInTx(prisma, async (tx) => {
    const guilds = await tx.guild.findMany({
      where: { id: { in: ids } },
      select: { id: true, credit: true }
    })
    const penalized: Array<{ guildId: string; credit: number }> = []
    for (const guild of guilds) {
      const next = applyCreditDelta(guild.credit, UNPAID_DAILY_PENALTY)
      if (next === guild.credit) continue // 이미 하한(0) — 쓰기·수집 생략.
      await tx.guild.update({
        where: { id: guild.id },
        data: { credit: next }
      })
      penalized.push({ guildId: guild.id, credit: next })
    }
    return penalized
  })
}

/**
 * 미납 패널티가 적용된 각 서버에 신뢰도 감소를 공지한다.
 *
 * 각 항목을 `AnnounceService.announceMany` 로 순차 전송한다. 빌드 콜백은 대상
 * 서버 로케일 `t` 로 경고 accent 컨테이너 하나를 만들며, 본문에 패널티 크기
 * (`penalty`=|UNPAID_DAILY_PENALTY|=10)와 적용 후 신뢰도(`credit`)를 인터폴레이션
 * 한다. 공지는 부가 효과이므로 전송 실패는 잡을 막지 않는다(서비스가 조용히 스킵).
 *
 * @param penalized 패널티 적용 서버 목록(길드 ID·적용 후 신뢰도).
 * @returns 실제 전송에 성공한 서버 수.
 */
export async function announceUnpaidPenalty(
  penalized: ReadonlyArray<{ guildId: string; credit: number }>
): Promise<number> {
  const penalty = Math.abs(UNPAID_DAILY_PENALTY)
  return AnnounceService.announceMany(
    penalized.map(({ guildId, credit }) => ({
      guildId,
      build: (t) => [
        simpleContainer(
          V2_ACCENT.warn,
          t('game:server.announce.daily.title'),
          t('game:server.announce.daily.body', { penalty, credit })
        )
      ]
    }))
  )
}

/**
 * 봇 퇴장 30일 경과 서버의 금고를 동결 풀로 수집한다 (결정 4·8).
 *
 * 대상: `leftAt <= now − 30일` 이고 `vault > 0` 인 서버 중, 아직 **미분배**
 * (`distributedAt=null`) 풀이 없는 서버. 이미 미분배 풀이 있으면 재수집 시
 * `frozenAmount` 를 덮어써(수집 후 vault=0 이므로 0 으로) 동결액이 소실되므로
 * 반드시 건너뛴다. 이전에 분배 완료된(`distributedAt != null`) 풀이 있고 서버가
 * 재조인 후 다시 이탈한 경우엔 upsert 의 update 경로로 풀을 재설정한다
 * (`distributedAt=null` 로 초기화).
 *
 * 유저 지갑은 글로벌 귀속(결정 4)이라 건드리지 않고 서버 금고만 동결한다.
 *
 * **레이스 방지**: 후보 목록은 tx 밖 findMany 스냅샷이라 `leftAt`·`vault` 가
 * stale 일 수 있다(수집 사이 재조인·금고 변동). 따라서 서버별 개별 트랜잭션
 * **안에서** `leftAt`·`vault`·풀 상태를 재조회해 조건을 재검증한 뒤에만
 * (풀 upsert + vault=0) 를 원자적으로 처리한다. Serializable 격리라 tx 내
 * read-then-write 는 SSI 로 보호되며, `frozenAmount` 도 스냅샷이 아닌 tx 내
 * 재조회 vault 를 사용한다.
 *
 * @param now 기준 시각(테스트 주입).
 * @returns 동결 서버 수와 동결 금고 합계.
 */
export async function collectInactive(
  prisma: PrismaClient,
  now: Date
): Promise<{ collectedGuilds: number; frozenTotal: bigint }> {
  const cutoff = new Date(now.getTime() - INACTIVE_DAYS * DAY_MS)
  const candidates = await prisma.guild.findMany({
    where: { leftAt: { not: null, lte: cutoff }, vault: { gt: 0n } },
    select: { id: true }
  })

  let collectedGuilds = 0
  let frozenTotal = 0n

  for (const candidate of candidates) {
    const frozen = await runInTx(prisma, async (tx) => {
      // 스냅샷은 stale 가능 — tx 안에서 leftAt·vault·풀 상태 재조회·재검증.
      const guild = await tx.guild.findUnique({
        where: { id: candidate.id },
        select: {
          leftAt: true,
          vault: true,
          inactivePool: { select: { distributedAt: true } }
        }
      })
      // 재조인(leftAt=null)·경과일 미달(leftAt>cutoff)·금고 소진 → 배제.
      if (!guild || guild.leftAt === null || guild.leftAt > cutoff) return null
      if (guild.vault <= 0n) return null
      // 미분배(PENDING) 풀이 이미 있으면 중복 수집 금지 (동결액 소실 방지).
      if (guild.inactivePool && guild.inactivePool.distributedAt === null)
        return null

      const amount = guild.vault
      await tx.inactiveServerPool.upsert({
        where: { guildId: candidate.id },
        create: {
          guildId: candidate.id,
          frozenAmount: amount,
          exitedAt: guild.leftAt
        },
        update: {
          frozenAmount: amount,
          exitedAt: guild.leftAt,
          distributedAt: null
        }
      })
      await tx.guild.update({
        where: { id: candidate.id },
        data: { vault: 0n }
      })
      return amount
    })

    if (frozen !== null) {
      collectedGuilds += 1
      frozenTotal += frozen
    }
  }

  return { collectedGuilds, frozenTotal }
}

/**
 * 일일 글로벌 잡 위임 로직 (스케줄 피스와 분리해 단위 테스트 가능).
 *
 * 1. 미납 서버 신뢰도 패널티(−10).
 * 2. 비활성 30일 서버 금고 동결.
 *
 * @param prisma - DB 클라이언트
 * @param now - 기준 시각(테스트 주입, 생략 시 호출 시각)
 */
export async function runDailyGlobal(
  prisma: PrismaClient,
  now: Date = new Date()
): Promise<DailyGlobalResult> {
  const penalized = await applyUnpaidPenalty(prisma)
  const penalizedGuilds = penalized.length
  const { collectedGuilds, frozenTotal } = await collectInactive(prisma, now)

  container.logger.info(
    `[daily-global] penalized=${penalizedGuilds} ` +
      `collected=${collectedGuilds} frozen=${frozenTotal}`
  )

  await announceUnpaidPenalty(penalized)

  return { penalizedGuilds, collectedGuilds, frozenTotal }
}

/**
 * 일일 글로벌 스케줄 태스크.
 *
 * `@sapphire/plugin-scheduled-tasks` (BullMQ/Redis) 기반 cron 반복 잡 —
 * UTC 15:00 = KST 00:00 (U-6). 큐 단위 dedup 으로 occurrence 당 1회 실행.
 */
export class DailyGlobalTask extends ScheduledTask {
  public constructor(
    context: ScheduledTask.LoaderContext,
    options: ScheduledTask.Options
  ) {
    super(context, {
      ...options,
      pattern: DAILY_GLOBAL_CRON
    })
  }

  public async run(): Promise<void> {
    await runDailyGlobal(container.db)
  }
}

declare module '@sapphire/plugin-scheduled-tasks' {
  interface ScheduledTasks {
    'daily-global': never
  }
}
