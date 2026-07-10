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
import { AnnounceService, type AnnounceItem } from '../../src/services/announce'
import type { PrismaClient } from '@idle/database'
import type { TFunction } from 'i18next'

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
      emergencySupportedGuildIds: [],
      changes: []
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

  it('신뢰도 변동/긴급 지원금을 각 서버 공지 채널로 디스패치한다', async () => {
    vi.spyOn(WeeklySettlementService, 'settleWeek').mockResolvedValue(
      fakeResult({ settledUsers: 3 })
    )
    // g-1: 증가(+50), g-2: 감소(-50)+긴급, g-3: 변동없음(스팸 방지 스킵)
    vi.spyOn(GuildService, 'applyWeeklyCredit').mockResolvedValue({
      updatedGuilds: 3,
      emergencySupportedGuildIds: ['g-2'],
      changes: [
        {
          guildId: 'g-1',
          before: 1000,
          after: 1050,
          delta: 50,
          emergency: false
        },
        {
          guildId: 'g-2',
          before: 250,
          after: 200,
          delta: -50,
          emergency: true
        },
        { guildId: 'g-3', before: 900, after: 900, delta: 0, emergency: false }
      ]
    })
    const announceSpy = vi
      .spyOn(AnnounceService, 'announceMany')
      .mockResolvedValue(0)

    await runWeeklySettlement(fakePrisma)

    expect(announceSpy).toHaveBeenCalledTimes(1)
    const items = announceSpy.mock.calls[0]![0] as ReadonlyArray<AnnounceItem>
    // weekly 2건(g-1, g-2) + emergency 1건(g-2) = 3건. delta 0 인 g-3 은 스킵.
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.guildId)).toEqual(['g-1', 'g-2', 'g-2'])

    // 캡처한 build 를 fakeT 로 호출해 사용 로케일 키를 검증.
    const keysOf = (item: AnnounceItem): string[] => {
      const seen: string[] = []
      const fakeT = ((key: string) => {
        seen.push(key)
        return key
      }) as unknown as TFunction
      const containers = item.build(fakeT)
      expect(containers).toHaveLength(1)
      return seen
    }

    const weeklyKeys = keysOf(items[0]!)
    expect(weeklyKeys).toContain('game:server.announce.weekly.title')
    expect(weeklyKeys).toContain('game:server.announce.weekly.body')
    expect(weeklyKeys).toContain('game:server.announce.weekly.tier')
    // after=1050 → TRUSTED 티어 라벨 조회.
    expect(weeklyKeys).toContain('game:server.vault.creditTier.TRUSTED')

    const emergencyKeys = keysOf(items[2]!)
    expect(emergencyKeys).toContain('game:server.announce.emergency.title')
    expect(emergencyKeys).toContain('game:server.announce.emergency.body')

    // 신뢰도 요약 info 는 여전히 2회(정산 + 신뢰도)로 유지.
    expect(container.logger.info).toHaveBeenCalledTimes(2)
  })
})
