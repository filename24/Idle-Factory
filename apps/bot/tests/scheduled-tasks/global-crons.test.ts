/**
 * 글로벌 신뢰도/재분배 잡의 cron 패턴 상수 유닛 테스트 (DB 무의존).
 *
 * 확정 결정 8: 일일 잡 = UTC 15:00(KST 00:00), 월간 분배 = 매월 1일 00:00 UTC.
 */

import { describe, expect, it } from 'vitest'

import { DAILY_GLOBAL_CRON } from '../../src/scheduled-tasks/daily-global'
import { MONTHLY_REDISTRIBUTION_CRON } from '../../src/scheduled-tasks/monthly-redistribution'

describe('global cron patterns', () => {
  it('일일 글로벌 잡은 UTC 15:00 = KST 00:00 이다 (U-6)', () => {
    expect(DAILY_GLOBAL_CRON).toBe('0 15 * * *')
  })

  it('월간 재분배는 매월 1일 00:00 UTC 이다', () => {
    expect(MONTHLY_REDISTRIBUTION_CRON).toBe('0 0 1 * *')
  })
})
