import { KST_UTC_OFFSET_MS } from '@idle/game-core'

/**
 * KST 자정 경계로 저장된 UTC 순간을 KST 달력 기준으로 재해석하는 순수 유틸.
 *
 * 게임 도메인의 시간 키(GuildDailyActivity.date·WeeklySettlementLine.weekStart 등)는
 * game-core 의 kstDayStart/kstWeekStart 로 만들어지며, "KST 자정 = UTC 전날 15:00"
 * 형태의 UTC 순간으로 저장된다(#16 KST 통일). 이 값을 그대로 `.toISOString()` 슬라이스하면
 * 달력일이 하루 이르게(−9h) 표시되므로, KST 오프셋(+9h)을 더해 보정한다.
 */

/**
 * KST 자정 경계 UTC 순간 → KST 기준 ISO 8601 문자열.
 * 시각 성분은 KST 자정을 표현하는 00:00:00 이 된다.
 * @param date KST 자정 경계로 저장된 UTC Date
 */
export function toKstIso(date: Date): string {
  return new Date(date.getTime() + KST_UTC_OFFSET_MS).toISOString()
}

/**
 * KST 자정 경계 UTC 순간 → KST 달력일 ISO 날짜(YYYY-MM-DD).
 * @param date KST 자정 경계로 저장된 UTC Date
 */
export function toKstDateString(date: Date): string {
  return toKstIso(date).slice(0, 10)
}
