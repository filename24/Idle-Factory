/**
 * `/debug` 수확 시계 조작 서브커맨드(advance-harvest/harvest-now)의 `tick` 옵션
 * autocomplete 템플릿·백데이트 순수 헬퍼.
 *
 * 수확 tick 은 실시간 `TICK_MS`(10분) 단위로만 누적되므로, "며칠 뒤·몇 시간 뒤"
 * 사람 친화 템플릿을 tick 수로 변환해 제공한다. Sapphire/DB/별칭 의존이 없어
 * 단위 테스트에서 목 없이 그대로 로드된다.
 */

import { TICK_MS } from '@idle/game-core'

/** 1시간에 해당하는 tick 수 (`TICK_MS` 기준 파생 — 60분 / 10분 = 6). */
export const TICKS_PER_HOUR = Math.round((60 * 60 * 1000) / TICK_MS)

/** 1일에 해당하는 tick 수 (24시간). */
export const TICKS_PER_DAY = TICKS_PER_HOUR * 24

/** 되감기 허용 상한 — 90일치 tick. QA 편의상 넉넉히 잡되 무한대는 막는다. */
export const MAX_ADVANCE_TICKS = TICKS_PER_DAY * 90

/** autocomplete 고정 프리셋용 시간 단위(시). */
const HOUR_PRESETS: readonly number[] = [1, 3, 6, 12]

/** autocomplete 고정 프리셋용 일 단위. */
const DAY_PRESETS: readonly number[] = [1, 2, 3, 7, 14, 30]

/** `tick` autocomplete 후보 한 개 — Discord 정수 choice(name/value). */
export interface TickTemplate {
  /** 사람이 읽을 라벨(예: "3일 뒤 · 432 tick") */
  readonly name: string
  /** 실제 tick 수 (정수 옵션 value) */
  readonly value: number
}

/**
 * "N시간 뒤" / "N일 뒤" 고정 프리셋 목록을 만든다(입력이 비었을 때 노출).
 *
 * @returns 시간 프리셋 뒤에 일 프리셋을 이은 템플릿 배열
 */
export function tickPresetTemplates(): TickTemplate[] {
  const hours = HOUR_PRESETS.map((h) => ({
    name: `${h}시간 뒤 · ${h * TICKS_PER_HOUR} tick`,
    value: h * TICKS_PER_HOUR
  }))
  const days = DAY_PRESETS.map((d) => ({
    name: `${d}일 뒤 · ${d * TICKS_PER_DAY} tick`,
    value: d * TICKS_PER_DAY
  }))
  return [...hours, ...days]
}

/**
 * 포커스 입력에 따른 `tick` autocomplete 후보를 만든다.
 *
 * - 양의 정수 `N` 입력: `[N시간 뒤, N일 뒤, N tick(직접)]` 해석을 노출한다
 *   (상한 초과 후보는 제외, 값 중복 제거). 유효 후보가 없으면 프리셋으로 폴백.
 * - 그 외(빈 문자열·비정수): 고정 프리셋을 노출한다.
 *
 * @param focused `tick` 옵션의 현재 입력 문자열
 * @returns Discord `respond()` 에 넘길 템플릿 배열
 */
export function tickAutocompleteTemplates(focused: string): TickTemplate[] {
  const trimmed = focused.trim()
  const n = Number(trimmed)
  if (trimmed !== '' && Number.isInteger(n) && n > 0) {
    const out: TickTemplate[] = []
    const push = (name: string, value: number): void => {
      if (
        value >= 1 &&
        value <= MAX_ADVANCE_TICKS &&
        !out.some((o) => o.value === value)
      ) {
        out.push({ name, value })
      }
    }
    push(`${n}시간 뒤 · ${n * TICKS_PER_HOUR} tick`, n * TICKS_PER_HOUR)
    push(`${n}일 뒤 · ${n * TICKS_PER_DAY} tick`, n * TICKS_PER_DAY)
    push(`${n} tick (직접 입력)`, n)
    return out.length > 0 ? out : tickPresetTemplates()
  }
  return tickPresetTemplates()
}

/**
 * tick 수를 사람이 읽는 경과 시간 문자열로 변환한다(응답 메시지용).
 *
 * 예: `432 → "3일"`, `6 → "1시간"`, `7 → "1시간 10분"`.
 *
 * @param ticks tick 수 (>=0)
 * @returns "N일 M시간 K분" 형태(0 단위는 생략), 0이면 "0분"
 */
export function formatTickDuration(ticks: number): string {
  const totalMinutes = ticks * (TICK_MS / 60000)
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = Math.floor(totalMinutes % 60)
  const parts: string[] = []
  if (days) parts.push(`${days}일`)
  if (hours) parts.push(`${hours}시간`)
  if (minutes) parts.push(`${minutes}분`)
  return parts.length > 0 ? parts.join(' ') : '0분'
}

/**
 * `now` 기준으로 `ticks` 개의 수확 tick 이 대기하도록 백데이트된 `lastHarvestAt` 을 만든다.
 *
 * `now - ticks × TICK_MS` 를 반환하므로, 이 값을 `Factory.lastHarvestAt` 에 넣고
 * 수확하면 `computeElapsedTicks` 가 정확히 `ticks` 를 돌려준다(대기 tick 을 **덮어쓴다**).
 *
 * @param now 기준 현재 시각
 * @param ticks 대기시킬 tick 수
 * @returns 백데이트된 시각
 */
export function computeBackdatedHarvestAt(now: Date, ticks: number): Date {
  return new Date(now.getTime() - ticks * TICK_MS)
}
