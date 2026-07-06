/**
 * 길드(서버) 단위 설정 서비스.
 *
 * - upsert/leftAt 토글로 봇 가입/퇴장 라이프사이클 관리.
 * - 어드민이 변경하는 설정(lang, taxSurcharge) 의 단일 진입점.
 *
 * 참조: docs/design/07-server.md §세금·정산
 */

import type { Guild as GuildRow, PrismaClient } from '@idle/database'
import {
  applyCreditDelta,
  creditXpBonusBps,
  effectiveMaxGrade,
  getCreditTier,
  weeklyCreditDelta,
  CREDIT_DEFAULT,
  EMERGENCY_CREDIT_THRESHOLD,
  EMERGENCY_SUPPORT_CAP,
  type CreditTier
} from '@idle/game-core'
import { ServiceError, runInTx, type ServiceErrorCode, type Tx } from './base'

/** taxSurcharge 허용 범위 (docs/07). */
const MIN_TAX_SURCHARGE = 0
const MAX_TAX_SURCHARGE = 0.2
/** 신규 가입 시 기본 가산 세율 — guildCreate 와 setup 양쪽이 일관되게 사용. */
export const DEFAULT_TAX_SURCHARGE = 0.1

/** 읽기 헬퍼가 트랜잭션 클라이언트로도 호출될 수 있도록 하는 유니온. */
type PrismaLike = PrismaClient | Tx

/**
 * 트랜잭션 내부에서 미분배 동결 금고를 복원하는 코어 로직 (결정 9).
 *
 * `InactiveServerPool` 행이 존재하고 아직 분배되지 않았으면(`distributedAt=null`)
 * `frozenAmount` 를 서버 금고에 되돌리고 풀 행을 삭제한다. 이미 분배됐으면
 * (`distributedAt != null`) 복원하지 않는다. 풀이 없으면 no-op.
 *
 * `upsertOnJoin`·`reconcileGuilds` 재조인 경로(leftAt 클리어)와 하나의 tx 로 묶어
 * 원자화하기 위해 tx 클라이언트를 받는다. 공개 `restoreInactivePool` 은 이 코어를
 * 새 tx 로 감싼 얇은 래퍼다.
 * 근거: docs/design/07-global-system.md §비활성 서버 자산 분배.
 *
 * @returns 복원된 금고액(복원 없으면 0n).
 */
async function restoreInactivePoolTx(tx: Tx, guildId: string): Promise<bigint> {
  const pool = await tx.inactiveServerPool.findUnique({
    where: { guildId },
    select: { id: true, frozenAmount: true, distributedAt: true }
  })
  if (!pool || pool.distributedAt !== null) return 0n
  await tx.guild.update({
    where: { id: guildId },
    data: { vault: { increment: pool.frozenAmount } }
  })
  await tx.inactiveServerPool.delete({ where: { id: pool.id } })
  return pool.frozenAmount
}

export interface UpsertOnJoinInput {
  readonly guildId: string
  readonly name: string
  readonly lang?: string
}

/**
 * 서버 신뢰도(Credit)로부터 파생되는 게임 효과 묶음.
 *
 * 공장 최대 등급·XP 보너스 계산의 단일 진입점 — 커맨드/서비스가 game-core
 * 순수 함수를 개별 호출하는 대신 이 헬퍼로 조회한다.
 * 근거: docs/design/07-global-system.md §신뢰도 효과, 이슈 #17.
 */
export interface CreditEffects {
  /** 현재 신뢰도(0~2000). 서버 미등록 시 기본값 1000. */
  readonly credit: number
  /** 신뢰도 구간. */
  readonly tier: CreditTier
  /** 공장 유효 최대 등급(8~10). */
  readonly effectiveMaxGrade: number
  /** XP 보너스(bps, 1만분율: 0 | 1000 | 2000). */
  readonly xpBonusBps: number
}

/**
 * `applyWeeklyCredit` 의 서버별 신뢰도 변동 항목.
 *
 * 호출자(주간 잡)가 서버별 공지를 구성하는 데 쓴다 — before/after 로 문구를
 * 만들고, `delta === 0` 이면 공지를 스킵(스팸 방지), `emergency` 면 긴급 지원금
 * 공지를 별도로 붙인다. 근거: docs/design/07-global-system.md §신뢰도 변동.
 */
export interface WeeklyCreditChange {
  /** 대상 서버(Discord snowflake). */
  readonly guildId: string
  /** 적용 전 신뢰도. */
  readonly before: number
  /** 적용 후 신뢰도(0~2000 clamp). */
  readonly after: number
  /** 증감량(`after - before`). 0 이면 변동 없음. */
  readonly delta: number
  /** 이 서버에 긴급 지원금(금고 보전)이 발동됐는지 여부. */
  readonly emergency: boolean
}

/** `applyWeeklyCredit` 결과 요약 — 호출자(주간 잡)가 로깅·공지에 쓴다. */
export interface WeeklyCreditResult {
  /** 신뢰도가 갱신된 활성 서버 수. */
  readonly updatedGuilds: number
  /** 긴급 지원금(금고 100만원 보전)이 발동된 서버 id 목록. */
  readonly emergencySupportedGuildIds: ReadonlyArray<string>
  /**
   * 서버별 신뢰도 변동 상세. 활성 서버 1건당 1개(변동 0 포함)로, 호출자가
   * 서버별 공지 디스패치에 사용한다. `emergencySupportedGuildIds` 와 중복되지만
   * before/after 문구 구성을 위해 별도로 노출한다(가산 확장).
   */
  readonly changes: ReadonlyArray<WeeklyCreditChange>
}

export const GuildService = {
  /**
   * 봇이 길드에 들어왔을 때 호출. row 가 없으면 생성, 있으면 name 갱신 + leftAt 클리어.
   * 재초대 시나리오를 안전하게 처리.
   *
   * **원자성**: upsert(leftAt=null 커밋)와 미분배 동결 금고 복원을 하나의
   * 트랜잭션으로 묶는다. 별개 tx 로 분리하면 복원 실패 시 leftAt 은 이미 null 이라
   * 어떤 경로로도 재복원되지 않는 유실이 생기므로(결정 9), 함께 롤백되도록 원자화한다.
   * 신규 가입 서버엔 풀이 없어 복원은 no-op 다. 반환 row 는 upsert 시점 스냅샷이라
   * 복원분(vault 증가)이 반영되지 않을 수 있으나, 호출부(guildCreate)는 vault 를
   * 표시하지 않는다.
   */
  async upsertOnJoin(
    prisma: PrismaClient,
    input: UpsertOnJoinInput
  ): Promise<GuildRow> {
    return runInTx(prisma, async (tx) => {
      const guild = await tx.guild.upsert({
        where: { id: input.guildId },
        create: {
          id: input.guildId,
          name: input.name,
          ...(input.lang !== undefined ? { lang: input.lang } : {}),
          taxSurcharge: DEFAULT_TAX_SURCHARGE
        },
        update: {
          name: input.name,
          leftAt: null
        }
      })
      // 재초대 복귀 시 미분배(distributedAt=null) 동결 금고 복원 (결정 9) — 동일 tx.
      await restoreInactivePoolTx(tx, input.guildId)
      return guild
    })
  },

  /**
   * 봇이 길드를 떠났을 때 호출. row 가 있으면 leftAt 만 set.
   * row 가 없으면 no-op (이미 등록 안 된 길드).
   */
  async markLeft(prisma: PrismaClient, guildId: string): Promise<void> {
    await prisma.guild.updateMany({
      where: { id: guildId, leftAt: null },
      data: { leftAt: new Date() }
    })
  },

  /** 어드민 액션 — 길드 언어 변경. */
  async updateLang(
    prisma: PrismaClient,
    guildId: string,
    lang: string
  ): Promise<GuildRow> {
    const exists = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError(
        'USER_NOT_FOUND',
        `guild ${guildId} not registered`
      )
    }
    return prisma.guild.update({
      where: { id: guildId },
      data: { lang }
    })
  },

  /**
   * 봇 ready 시점에 현재 보이는 길드 목록과 DB 상태를 동기화한다.
   *
   * 다운타임 중 발생한 가입/탈퇴 이벤트는 봇이 못 받았으므로 ready 시 재대조 필수.
   *
   * - **누락 row**: 현재 보이지만 DB 에 없음 → upsertOnJoin 으로 생성.
   * - **재조인**: DB 에 있지만 `leftAt != null` → leftAt 클리어 + name 갱신.
   * - **이름 변경만**: 기존 row 가 살아있고 이름만 바뀜 → name 만 갱신.
   * - **퇴장 감지**: DB 에 leftAt=null 인데 현재 캐시에 없음 → markLeft.
   *   `detectLeft: false` (sharding) 면 스킵 — 다른 샤드가 보유 중일 수 있으므로
   *   섣불리 left 처리하면 안 됨.
   */
  async reconcileGuilds(
    prisma: PrismaClient,
    currentGuilds: ReadonlyArray<{ id: string; name: string }>,
    options: { detectLeft: boolean }
  ): Promise<{
    created: number
    rejoined: number
    renamed: number
    left: number
  }> {
    const counters = { created: 0, rejoined: 0, renamed: 0, left: 0 }
    const dbGuilds = await prisma.guild.findMany({
      select: { id: true, name: true, leftAt: true }
    })
    const dbById = new Map(dbGuilds.map((g) => [g.id, g]))

    for (const current of currentGuilds) {
      const row = dbById.get(current.id)
      if (!row) {
        await GuildService.upsertOnJoin(prisma, {
          guildId: current.id,
          name: current.name
        })
        counters.created += 1
        continue
      }
      if (row.leftAt !== null) {
        // 재조인: leftAt 클리어 + 미분배 동결 금고 복원을 하나의 tx 로 원자화
        // (upsertOnJoin 과 동일한 이유 — 복원 실패 시 leftAt 재복원 불가 방지, 결정 9).
        await runInTx(prisma, async (tx) => {
          await tx.guild.update({
            where: { id: current.id },
            data: { leftAt: null, name: current.name }
          })
          await restoreInactivePoolTx(tx, current.id)
        })
        counters.rejoined += 1
        continue
      }
      if (row.name !== current.name) {
        await prisma.guild.update({
          where: { id: current.id },
          data: { name: current.name }
        })
        counters.renamed += 1
      }
    }

    if (options.detectLeft) {
      const visibleIds = new Set(currentGuilds.map((g) => g.id))
      for (const row of dbGuilds) {
        if (row.leftAt === null && !visibleIds.has(row.id)) {
          await GuildService.markLeft(prisma, row.id)
          counters.left += 1
        }
      }
    }

    return counters
  },

  /** 어드민 액션 — 가산 세율 변경. 0~0.2 범위 강제. */
  async updateTaxSurcharge(
    prisma: PrismaClient,
    guildId: string,
    surcharge: number
  ): Promise<GuildRow> {
    if (
      !Number.isFinite(surcharge) ||
      surcharge < MIN_TAX_SURCHARGE ||
      surcharge > MAX_TAX_SURCHARGE
    ) {
      throw new ServiceError(
        'INVALID_PRICE',
        `taxSurcharge must be in [${MIN_TAX_SURCHARGE}, ${MAX_TAX_SURCHARGE}], got ${surcharge}`
      )
    }
    const exists = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError(
        'USER_NOT_FOUND',
        `guild ${guildId} not registered`
      )
    }
    return prisma.guild.update({
      where: { id: guildId },
      data: { taxSurcharge: surcharge }
    })
  },

  /**
   * 서버 신뢰도에서 파생된 게임 효과(티어·공장 최대 등급·XP 보너스)를 조회한다.
   *
   * 서버가 등록돼 있지 않으면 스키마 기본 신뢰도(1000, TRUSTED)로 간주한다 —
   * ready 시 `reconcileGuilds` 로 모든 가시 서버가 등록되므로 운영 경로에서는
   * 항상 실제 값이 조회된다.
   * 근거: docs/design/07-global-system.md §신뢰도 효과, 이슈 #17 확정 결정 1·6.
   */
  async getCreditEffects(
    prisma: PrismaLike,
    guildId: string
  ): Promise<CreditEffects> {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { credit: true }
    })
    const credit = guild?.credit ?? CREDIT_DEFAULT
    return {
      credit,
      tier: getCreditTier(credit),
      effectiveMaxGrade: effectiveMaxGrade(credit),
      xpBonusBps: creditXpBonusBps(credit)
    }
  },

  /**
   * 서버 신뢰도가 `min` 미만이면 `ServiceError(errorCode)` 를 던지는 가드.
   *
   * 버튼/셀렉트 핸들러 우회를 막기 위해 서비스 레이어에서 차단한다 (결정 7).
   * 미등록 서버는 기본 신뢰도(1000)로 간주해 통과시킨다.
   * 근거: docs/design/07-global-system.md §신뢰도 효과.
   *
   * @throws {ServiceError} 신뢰도가 `min` 미만일 때 `errorCode` 로 throw.
   */
  async assertCreditAtLeast(
    prisma: PrismaLike,
    guildId: string,
    min: number,
    errorCode: ServiceErrorCode
  ): Promise<void> {
    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { credit: true }
    })
    const credit = guild?.credit ?? CREDIT_DEFAULT
    if (credit < min) {
      throw new ServiceError(
        errorCode,
        `guild ${guildId} credit ${credit} < ${min}`,
        { credit, min }
      )
    }
  },

  /**
   * 전체 활성 서버(`leftAt=null`)에 주간 신뢰도 증감을 적용한다 (주간 잡 훅).
   *
   * 서버별 `delta = floor(weeklyDAU × 0.5) − 10` 을 적용하고 0~2000 으로 clamp
   * 한다. 입력 `weeklyDAU` 는 **직전 주** 값이어야 하므로 반드시
   * `refreshWeeklyDau` 로 DB 의 weeklyDAU 가 갱신된 뒤 호출한다.
   *
   * 긴급 지원금(결정 3): 적용 후 신뢰도 < 300 이고 금고 < 100만원이면 금고를
   * 100만원까지 보전한다("글로벌 은행" 시스템 발행). 발동 서버 id 는 결과로
   * 반환해 호출자가 로깅한다(서비스는 로거에 의존하지 않는다 — weeklySettlement
   * 관례 준수).
   *
   * **금고 보전은 절대 SET 이 아닌 부족분 증분(increment)** 으로 처리한다. 서버별
   * tx 안에서 금고를 재조회해 `CAP − freshVault` 만큼만 increment 하므로, 잡 실행
   * 중 병행 발생한 금고 증가분을 덮어써 유실하지 않는다(과거 blind SET 결함 수정).
   *
   * 멱등하지 않다(실행마다 delta 재적용). 잡 중복 실행 방지는 스케줄러 큐의
   * occurrence 단위 dedup 에 의존한다.
   * 근거: docs/design/07-global-system.md §신뢰도 변동·§신뢰도 효과, 결정 3.
   */
  async applyWeeklyCredit(prisma: PrismaClient): Promise<WeeklyCreditResult> {
    const guilds = await prisma.guild.findMany({
      where: { leftAt: null },
      select: { id: true, credit: true, weeklyDAU: true, vault: true }
    })

    const emergencySupportedGuildIds: string[] = []
    const changes: WeeklyCreditChange[] = []
    let updatedGuilds = 0

    for (const g of guilds) {
      const nextCredit = applyCreditDelta(
        g.credit,
        weeklyCreditDelta(g.weeklyDAU)
      )
      // 스냅샷 기준 긴급 대상 여부 — 실제 보전은 tx 내 재조회로 확정.
      const maybeEmergency =
        nextCredit < EMERGENCY_CREDIT_THRESHOLD &&
        g.vault < EMERGENCY_SUPPORT_CAP

      const emergencyApplied = await runInTx(prisma, async (tx) => {
        if (!maybeEmergency) {
          await tx.guild.update({
            where: { id: g.id },
            data: { credit: nextCredit }
          })
          return false
        }
        // 금고를 tx 안에서 재조회 — 스냅샷 vault 도 stale 가능.
        const fresh = await tx.guild.findUnique({
          where: { id: g.id },
          select: { vault: true }
        })
        const needsTopUp = fresh !== null && fresh.vault < EMERGENCY_SUPPORT_CAP
        await tx.guild.update({
          where: { id: g.id },
          data: {
            credit: nextCredit,
            ...(needsTopUp
              ? { vault: { increment: EMERGENCY_SUPPORT_CAP - fresh.vault } }
              : {})
          }
        })
        return needsTopUp
      })

      updatedGuilds += 1
      if (emergencyApplied) emergencySupportedGuildIds.push(g.id)
      changes.push({
        guildId: g.id,
        before: g.credit,
        after: nextCredit,
        delta: nextCredit - g.credit,
        emergency: emergencyApplied
      })
    }

    return { updatedGuilds, emergencySupportedGuildIds, changes }
  },

  /**
   * 서버 복귀 시 미분배 동결 금고를 복원한다 (결정 9) — 독립 진입점.
   *
   * `restoreInactivePoolTx` 코어를 새 트랜잭션으로 감싼 얇은 래퍼. 풀 행이 있고
   * 미분배면 `frozenAmount` 를 금고에 되돌리고 행을 삭제, 이미 분배됐거나 풀이
   * 없으면 no-op.
   * 근거: docs/design/07-global-system.md §비활성 서버 자산 분배.
   *
   * @returns 복원된 금고액(복원 없으면 0n).
   */
  async restoreInactivePool(
    prisma: PrismaClient,
    guildId: string
  ): Promise<bigint> {
    return runInTx(prisma, (tx) => restoreInactivePoolTx(tx, guildId))
  }
} as const
