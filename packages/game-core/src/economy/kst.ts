/**
 * KST(UTC+9) 시간 경계 계산 — 순수 모듈.
 *
 * 경제 시스템의 시간 기준은 KST 로 통일한다 (#16 확정):
 *  - 자재 직구매 일일 한도 리셋: 매일 KST 자정
 *    (docs/design/04-economy.md §레벨별 일일 한도의 "UTC 00:00 (or 서버 시각)"
 *    표기를 U-6 주간 정산 KST 와 일관되게 KST 자정으로 확정)
 *  - 주간 세금 정산 윈도: 일요일 00:00 KST 경계
 *    (docs/design/07-global-system.md §정산 주기, U-6 2026-07-03 확정)
 *
 * KST 는 DST 가 없는 고정 오프셋(+9h)이므로 타임존 라이브러리 없이
 * 밀리초 산술만으로 결정적으로 계산한다.
 */

/** 하루(ms). */
const DAY_MS = 24 * 60 * 60 * 1000

/** 일주일(ms). */
const WEEK_MS = 7 * DAY_MS

/**
 * KST(UTC+9) 고정 오프셋(ms). 한국은 DST 미시행 — 상수로 안전하다.
 * 근거: docs/design/07-global-system.md §정산 주기 (U-6, KST 기준 확정).
 */
export const KST_UTC_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * 주어진 시각이 속한 KST 달력일의 자정(00:00 KST)을 UTC 순간으로 반환한다.
 *
 * 예: `2026-07-03T14:59:00Z`(= KST 7/3 23:59) → `2026-07-02T15:00:00Z`
 * (= KST 7/3 00:00). `DailyPurchase.date` 의 일자 키로 사용한다
 * (docs/design/04-economy.md §레벨별 일일 한도 — 리셋 KST 자정, #16 확정).
 *
 * @param at 기준 시각
 * @returns 해당 KST 일자의 자정에 대응하는 UTC `Date`
 */
export function kstDayStart(at: Date): Date {
  const shifted = at.getTime() + KST_UTC_OFFSET_MS
  const dayStartShifted = Math.floor(shifted / DAY_MS) * DAY_MS
  return new Date(dayStartShifted - KST_UTC_OFFSET_MS)
}

/**
 * 주어진 시각이 속한 KST 달력일의 다음 자정(내일 00:00 KST)을 반환한다.
 *
 * 직구매 일일 한도의 "리셋 예정 시각" 표시용
 * (docs/design/04-economy.md §레벨별 일일 한도).
 *
 * @param at 기준 시각
 * @returns 다음 KST 자정에 대응하는 UTC `Date`
 */
export function kstNextDayStart(at: Date): Date {
  return new Date(kstDayStart(at).getTime() + DAY_MS)
}

/**
 * 주어진 시각 기준 "가장 최근의 일요일 00:00 KST"(경계 포함)를 반환한다.
 *
 * 주간 세금 정산 윈도 경계 — 정산 잡이 일요일 00:00 KST(UTC 토 15:00)에
 * 실행되면 이 함수의 반환값이 윈도의 **끝**, 반환값-7일이 윈도의 **시작**이
 * 된다 (docs/design/07-global-system.md §정산 주기, U-6).
 *
 * `at` 이 정확히 일요일 00:00 KST 라면 그 시각 자체를 반환한다.
 *
 * @param at 기준 시각
 * @returns 직전(또는 당도한) 일요일 00:00 KST 에 대응하는 UTC `Date`
 */
export function kstWeekStart(at: Date): Date {
  const dayStart = kstDayStart(at)
  // KST 자정 순간을 KST 로 옮겨 요일 판정 (0 = 일요일).
  const shifted = new Date(dayStart.getTime() + KST_UTC_OFFSET_MS)
  const weekday = shifted.getUTCDay()
  return new Date(dayStart.getTime() - weekday * DAY_MS)
}

/**
 * 주간 정산 윈도 [시작, 끝) 을 계산한다.
 *
 * `끝 = kstWeekStart(at)` (직전 일요일 00:00 KST), `시작 = 끝 - 7일`.
 * 반열림 구간 — 끝 시각 정각에 발생한 거래는 다음 주 윈도에 귀속된다
 * (docs/design/07-global-system.md §정산 주기 "주간 판매 수익 누적").
 *
 * @param at 기준 시각 (보통 정산 잡 실행 시각)
 * @returns `{ start, end }` — UTC `Date` 쌍
 */
export function kstSettlementWindow(at: Date): { start: Date; end: Date } {
  const end = kstWeekStart(at)
  return { start: new Date(end.getTime() - WEEK_MS), end }
}
