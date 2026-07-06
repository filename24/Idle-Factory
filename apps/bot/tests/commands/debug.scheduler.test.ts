/**
 * `/debug run-scheduler` 의 순수 매핑/실행 헬퍼 `runSchedulerTask` 유닛 테스트.
 *
 * DB·discord 목 없이 각 task 값이 올바른 스케줄러 run* / expireStale 를 호출하고,
 * 반환 summary 문자열이 실행 결과 수치를 반영하는지 검증한다. 스케줄러 함수는
 * `vi.spyOn` 으로 가짜 결과를 반환하도록 대체하므로 실제 실행은 일어나지 않는다.
 */

// config 모듈은 최상위에서 requireEnv('BOT_TOKEN') 를 실행하므로,
// 테스트 환경(BOT_TOKEN 미설정)에서 로드 시 예외가 난다 → 목으로 대체한다.
import { vi, describe, expect, it, afterEach } from 'vitest'

vi.mock('../../src/config', () => ({ default: { devGuildID: undefined } }))

// tsconfig path 별칭(@utils/@structures)은 vitest 가 해석하지 못하므로 스텁으로 대체한다.
// 이 심볼들은 커맨드 메서드 본문에서만 쓰이고 runSchedulerTask 에서는 호출되지 않는다.
vi.mock('@utils/ComponentsV2', () => ({
  simpleV2Payload: () => ({}),
  V2_ACCENT: {},
  v2Flags: () => ({})
}))
vi.mock('@structures/renderers', () => ({
  buildDirectBuyMaterialSelectContainer: () => ({}),
  buildPriceBoardContainer: () => ({}),
  buildSellMaterialSelectContainer: () => ({}),
  formatBigInt: (v: bigint) => String(v)
}))
vi.mock('@utils/marketErrorKey', () => ({
  resolveMarketErrorMessage: () => ''
}))

import { runSchedulerTask } from '../../src/commands/dev/debug'
import { MarketService } from '../../src/services/market'
import * as weekly from '../../src/scheduled-tasks/weekly-settlement'
import * as daily from '../../src/scheduled-tasks/daily-global'
import * as monthly from '../../src/scheduled-tasks/monthly-redistribution'

/** 테스트용 가짜 PrismaClient — 헬퍼는 이를 그대로 run* 로 넘길 뿐이다. */
const db = {} as never

describe('runSchedulerTask', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('market-expire 는 MarketService.expireStale 를 호출하고 만료 건수를 요약한다', async () => {
    const spy = vi
      .spyOn(MarketService, 'expireStale')
      .mockResolvedValue({ expiredCount: 7 })

    const result = await runSchedulerTask('market-expire', db)

    expect(spy).toHaveBeenCalledWith(db)
    expect(result.task).toBe('market-expire')
    expect(result.summary).toContain('7')
  })

  it('알 수 없는/기본 task 는 market-expire 로 처리한다', async () => {
    const spy = vi
      .spyOn(MarketService, 'expireStale')
      .mockResolvedValue({ expiredCount: 0 })

    const result = await runSchedulerTask('unknown-task', db)

    expect(spy).toHaveBeenCalledWith(db)
    expect(result.summary).toContain('0')
  })

  it('weekly-settlement 은 runWeeklySettlement 을 호출하고 정산 유저 수를 요약한다', async () => {
    const spy = vi.spyOn(weekly, 'runWeeklySettlement').mockResolvedValue(42)

    const result = await runSchedulerTask('weekly-settlement', db)

    expect(spy).toHaveBeenCalledWith(db)
    expect(result.task).toBe('weekly-settlement')
    expect(result.summary).toContain('42')
  })

  it('daily-global 은 runDailyGlobal 을 호출하고 패널티/동결 수치를 요약한다', async () => {
    const spy = vi.spyOn(daily, 'runDailyGlobal').mockResolvedValue({
      penalizedGuilds: 3,
      collectedGuilds: 5,
      frozenTotal: 999n
    })

    const result = await runSchedulerTask('daily-global', db)

    expect(spy).toHaveBeenCalledWith(db)
    expect(result.task).toBe('daily-global')
    expect(result.summary).toContain('3')
    expect(result.summary).toContain('5')
  })

  it('monthly-redistribution 은 runMonthlyRedistribution 을 호출하고 서버/유저 수를 요약한다', async () => {
    const spy = vi
      .spyOn(monthly, 'runMonthlyRedistribution')
      .mockResolvedValue({
        totalPool: 1000n,
        distributedPools: 2,
        guildShares: 4,
        userPayouts: 11,
        failedGuildIds: [],
        payouts: []
      })

    const result = await runSchedulerTask('monthly-redistribution', db)

    expect(spy).toHaveBeenCalledWith(db)
    expect(result.task).toBe('monthly-redistribution')
    expect(result.summary).toContain('4')
    expect(result.summary).toContain('11')
  })
})
