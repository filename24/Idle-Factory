/**
 * `runWeeklySettlement` 위임 로직 유닛 테스트.
 *
 * DB 의존 없음 — `WeeklySettlementService.settleWeek` 을 mock 해 위임 호출
 * (prisma 전달), 반환값, 로그(요약 info + 유저 단위 실패 error)를 검증한다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  runWeeklySettlement,
  WEEKLY_SETTLEMENT_CRON
} from '../../src/scheduled-tasks/weekly-settlement'
import {
  WeeklySettlementService,
  type SettleWeekResult
} from '../../src/services/weeklySettlement'
import { GuildService } from '../../src/services/guild'
import type { PrismaClient } from '@idle/database'

const fakePrisma = {} as PrismaClient

function fakeResult(overrides: Partial<SettleWeekResult>): SettleWeekResult {
  return {
    weekStart: new Date('2026-06-27T15:00:00Z'),
    weekEnd: new Date('2026-07-04T15:00:00Z'),
    settledUsers: 0,
    skippedUsers: 0,
    totalTaxPaid: 0n,
    totalVaultDeposited: 0n,
    totalUnpaid: 0n,
    dauUpdatedGuilds: 0,
    prunedActivityRows: 0,
    failures: [],
    ...overrides
  }
}

describe('runWeeklySettlement', () => {
  beforeEach(() => {
    // container.logger 는 클라이언트 없이는 미설정이므로 스텁 주입.
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
    // 주간 신뢰도 적용(#17)은 별도 검증하므로 여기선 no-op 스텁.
    vi.spyOn(GuildService, 'applyWeeklyCredit').mockResolvedValue({
      updatedGuilds: 0,
      emergencySupportedGuildIds: []
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('cron 은 UTC 토 15:00 = KST 일 00:00 이다 (U-6)', () => {
    expect(WEEKLY_SETTLEMENT_CRON).toBe('0 15 * * 6')
  })

  it('settleWeek 에 prisma 를 위임하고 settledUsers 를 반환한다', async () => {
    const spy = vi
      .spyOn(WeeklySettlementService, 'settleWeek')
      .mockResolvedValue(fakeResult({ settledUsers: 7 }))

    const result = await runWeeklySettlement(fakePrisma)

    expect(spy).toHaveBeenCalledWith(fakePrisma)
    expect(result).toBe(7)
    // 정산 요약 + 신뢰도 요약 두 건의 info 로그.
    expect(container.logger.info).toHaveBeenCalledTimes(2)
    expect(GuildService.applyWeeklyCredit).toHaveBeenCalledWith(fakePrisma)
    expect(container.logger.error).not.toHaveBeenCalled()
  })

  it('유저 단위 실패는 건별 error 로그를 남기고 잡은 정상 종료한다', async () => {
    vi.spyOn(WeeklySettlementService, 'settleWeek').mockResolvedValue(
      fakeResult({
        settledUsers: 1,
        failures: [
          { userId: 'u-1', message: 'boom' },
          { userId: 'u-2', message: 'kaboom' }
        ]
      })
    )

    const result = await runWeeklySettlement(fakePrisma)

    expect(result).toBe(1)
    expect(container.logger.error).toHaveBeenCalledTimes(2)
  })
})
