/**
 * `GuildActivityService` 통합 테스트 (전용 idle_i16-dev DB).
 *
 * 검증 축 (GitHub #16 — weeklyDAU 원천 데이터 축적):
 *  - 멱등 upsert: 같은 서버×유저×KST 일자는 1행만 남는다
 *  - KST 자정 경계에서 일자 키가 분리된다
 *  - FK 없는 best-effort 기록 — 유저/길드 행이 없어도 성공
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { GuildActivityService } from '../../src/services/guildActivity'
import { closeDb, resetDb, testPrisma } from './setup'

/** KST 2026-07-03 23:59 — 자정 직전. */
const LATE_NIGHT_KST = new Date('2026-07-03T14:59:00Z')
/** KST 2026-07-04 00:00 — 다음 날 자정. */
const NEXT_MIDNIGHT_KST = new Date('2026-07-03T15:00:00Z')

describe('GuildActivityService.recordDailyActivity', () => {
  beforeEach(async () => {
    await resetDb()
  })

  afterAll(async () => {
    await closeDb()
  })

  it('같은 날 반복 기록은 1행으로 dedupe 된다 (skipDuplicates)', async () => {
    const first = await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-1',
      userId: 'u-1',
      now: LATE_NIGHT_KST
    })
    const second = await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-1',
      userId: 'u-1',
      now: new Date(LATE_NIGHT_KST.getTime() + 30_000)
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(await testPrisma.guildDailyActivity.count()).toBe(1)

    const row = await testPrisma.guildDailyActivity.findFirstOrThrow()
    expect(row.date.toISOString()).toBe('2026-07-02T15:00:00.000Z') // KST 7/3 자정
  })

  it('KST 자정을 넘기면 새 일자 행이 생긴다', async () => {
    await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-1',
      userId: 'u-1',
      now: LATE_NIGHT_KST
    })
    const next = await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: 'g-1',
      userId: 'u-1',
      now: NEXT_MIDNIGHT_KST
    })

    expect(next).toBe(true)
    expect(await testPrisma.guildDailyActivity.count()).toBe(2)
  })

  it('서버·유저가 DB 에 시드되지 않았어도 기록된다 (FK 없음)', async () => {
    // User/Guild 행을 만들지 않은 순수 snowflake — best-effort 통계 적재.
    const ok = await GuildActivityService.recordDailyActivity(testPrisma, {
      guildId: '999999999999999999',
      userId: '888888888888888888'
    })
    expect(ok).toBe(true)
  })
})
