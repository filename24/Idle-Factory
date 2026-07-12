/**
 * `/debug run-scheduler` 의 스토어 기반 실행 헬퍼 유닛 테스트.
 *
 * 새 스케줄러 피스가 추가되면 자동으로 실행 대상이 되도록, `runSchedulerTask` 는
 * 하드코딩 목록 대신 런타임 scheduled-tasks 스토어를 조회한다:
 *  - 스토어에 없는 task → `null`(알 수 없음)
 *  - 알려진 task(market-expire/weekly/daily/monthly) → 대응 run*·expireStale 로
 *    실행 후 상세 요약
 *  - 스토어에 있으나 상세 요약이 없는 task → 피스의 `run()` 을 직접 호출하고
 *    일반 요약으로 폴백
 * `listSchedulerTaskNames` 는 스토어 키를 정렬해 autocomplete 후보로 노출한다.
 */

import { vi, describe, expect, it, afterEach } from 'vitest'

vi.mock('../../src/config', () => ({ default: { devGuildID: undefined } }))

// tsconfig path 별칭(@utils/@structures)은 vitest 가 해석하지 못하므로 스텁으로 대체한다.
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

import {
  runSchedulerTask,
  runAllSchedulerTasks,
  listSchedulerTaskNames,
  type SchedulerStore
} from '../../src/commands/dev/debug'
import { MarketService } from '../../src/services/market'
import * as weekly from '../../src/scheduled-tasks/weekly-settlement'
import * as daily from '../../src/scheduled-tasks/daily-global'
import * as monthly from '../../src/scheduled-tasks/monthly-redistribution'

const db = {} as never

/** 이름 목록(+선택적 run 스파이)으로 최소 scheduled-tasks 스토어를 흉내낸다. */
function fakeStore(
  names: string[],
  run: () => unknown = () => undefined
): SchedulerStore {
  const map = new Map(names.map((n) => [n, { run }]))
  return {
    has: (n) => map.has(n),
    get: (n) => map.get(n),
    keys: () => map.keys()
  }
}

const ALL = [
  'market-expire',
  'weekly-settlement',
  'daily-global',
  'monthly-redistribution',
  'market-price-tick'
]

describe('runSchedulerTask', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('스토어에 없는 task 는 null 을 반환한다(알 수 없음)', async () => {
    const result = await runSchedulerTask('does-not-exist', db, fakeStore(ALL))
    expect(result).toBeNull()
  })

  it('market-expire 는 expireStale 를 호출하고 만료 건수를 요약한다', async () => {
    const spy = vi
      .spyOn(MarketService, 'expireStale')
      .mockResolvedValue({ expiredCount: 7 })

    const result = await runSchedulerTask('market-expire', db, fakeStore(ALL))

    expect(spy).toHaveBeenCalledWith(db)
    expect(result?.task).toBe('market-expire')
    expect(result?.summary).toContain('7')
  })

  it('weekly-settlement 은 runWeeklySettlement 을 호출하고 정산 유저 수를 요약한다', async () => {
    const spy = vi.spyOn(weekly, 'runWeeklySettlement').mockResolvedValue(42)

    const result = await runSchedulerTask(
      'weekly-settlement',
      db,
      fakeStore(ALL)
    )

    expect(spy).toHaveBeenCalledWith(db)
    expect(result?.summary).toContain('42')
  })

  it('daily-global 은 runDailyGlobal 을 호출하고 패널티/동결 수치를 요약한다', async () => {
    const spy = vi.spyOn(daily, 'runDailyGlobal').mockResolvedValue({
      penalizedGuilds: 3,
      collectedGuilds: 5,
      frozenTotal: 999n
    })

    const result = await runSchedulerTask('daily-global', db, fakeStore(ALL))

    expect(spy).toHaveBeenCalledWith(db)
    expect(result?.summary).toContain('3')
    expect(result?.summary).toContain('5')
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

    const result = await runSchedulerTask(
      'monthly-redistribution',
      db,
      fakeStore(ALL)
    )

    expect(spy).toHaveBeenCalledWith(db)
    expect(result?.summary).toContain('4')
    expect(result?.summary).toContain('11')
  })

  it('상세 요약이 없는 task 는 피스의 run() 을 직접 호출하고 일반 요약으로 폴백한다', async () => {
    const run = vi.fn().mockResolvedValue(undefined)
    const store = fakeStore(['market-price-tick'], run)

    const result = await runSchedulerTask('market-price-tick', db, store)

    expect(run).toHaveBeenCalledTimes(1)
    expect(result?.task).toBe('market-price-tick')
    expect(result?.summary.length).toBeGreaterThan(0)
  })
})

describe('runAllSchedulerTasks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('등록된 모든 스케줄러를 실행하고 각 결과 요약을 모은다', async () => {
    vi.spyOn(MarketService, 'expireStale').mockResolvedValue({
      expiredCount: 2
    })
    const run = vi.fn().mockResolvedValue(undefined)
    const store = fakeStore(['market-expire', 'market-price-tick'], run)

    const results = await runAllSchedulerTasks(db, store)

    expect(results).toHaveLength(2)
    const byTask = Object.fromEntries(results.map((r) => [r.task, r.summary]))
    expect(byTask['market-expire']).toContain('2')
    expect(byTask['market-price-tick']).toBeDefined()
    // rich 는 expireStale, generic 만 피스 run() 을 호출한다.
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('개별 task 실패는 나머지를 막지 않고 실패 요약으로 기록한다', async () => {
    vi.spyOn(MarketService, 'expireStale').mockRejectedValue(new Error('boom'))
    const run = vi.fn().mockResolvedValue(undefined)
    const store = fakeStore(['market-expire', 'market-price-tick'], run)

    const results = await runAllSchedulerTasks(db, store)

    expect(results).toHaveLength(2)
    const byTask = Object.fromEntries(results.map((r) => [r.task, r.summary]))
    expect(byTask['market-expire']).toContain('실패')
    expect(byTask['market-price-tick']).toContain('완료')
  })
})

describe('listSchedulerTaskNames', () => {
  it('스토어 키를 정렬해 반환한다(새 태스크 자동 포함)', () => {
    const names = listSchedulerTaskNames(
      fakeStore(['weekly-settlement', 'market-expire', 'daily-global'])
    )
    expect(names).toEqual([
      'daily-global',
      'market-expire',
      'weekly-settlement'
    ])
  })
})
