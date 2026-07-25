/**
 * 표준 시나리오 정의 (#31 §시나리오 정의).
 *
 * 유저 M명(1/10/100) × N일(1/7/30) × 프로파일 조합. 시드를 시나리오 id 에서
 * 결정적으로 유도하므로, 같은 id 는 언제 어디서 돌려도 같은 결과를 낸다.
 */

import { ALL_PROFILE_KINDS } from './profiles'
import { DEFAULT_ECONOMY_PARAMS, STARTING_MONEY } from './state'
import type { EconomyParams, PlayProfileKind, SimScenario } from './types'

/** 표준 유저 규모 축. */
export const STANDARD_USER_COUNTS: readonly number[] = [1, 10, 100]

/** 표준 기간 축 (일). */
export const STANDARD_DAYS: readonly number[] = [1, 7, 30]

/**
 * 문자열에서 결정론적 시드를 유도한다 (FNV-1a 32비트).
 *
 * 시나리오 id 만으로 시드가 정해지므로 리포트에 시드를 따로 적어 둘 필요가
 * 없고, 시나리오를 추가해도 기존 시나리오의 결과가 흔들리지 않는다.
 *
 * @param text 시드 원본 문자열
 * @returns 32비트 부호 없는 정수 시드
 */
export function deriveSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/** `buildScenario` 옵션. */
export interface BuildScenarioOptions {
  /** 유저 수. */
  readonly userCount: number
  /** 기간 (일). */
  readonly days: number
  /** 프로파일 구성. 생략 시 3종 혼합. */
  readonly profiles?: readonly PlayProfileKind[]
  /** 경제 파라미터 덮어쓰기 (부분 지정 가능). */
  readonly params?: Partial<EconomyParams>
  /** 시나리오 id 접미사 — 스윕에서 축 값을 구분할 때 쓴다. */
  readonly suffix?: string
}

/**
 * 시나리오를 조립한다.
 *
 * @param options 유저 수·기간·프로파일·파라미터
 * @returns 완성된 시나리오
 */
export function buildScenario(options: BuildScenarioOptions): SimScenario {
  const profiles = options.profiles ?? ALL_PROFILE_KINDS
  const profileTag = profiles.length === ALL_PROFILE_KINDS.length ? 'mixed' : profiles.join('+')
  const id = [`u${options.userCount}`, `d${options.days}`, profileTag, options.suffix]
    .filter(Boolean)
    .join('-')

  return {
    id,
    userCount: options.userCount,
    days: options.days,
    profiles,
    seed: deriveSeed(id),
    params: { ...DEFAULT_ECONOMY_PARAMS, ...options.params },
    startingMoney: STARTING_MONEY,
  }
}

/**
 * 회귀 게이트용 기본 시나리오 묶음.
 *
 * 프로파일 단일 시나리오(각 프로파일이 혼자 있을 때의 순수 경제)와 혼합
 * 시나리오를 함께 낸다 — 단일 프로파일은 목표치 검증에, 혼합은 유저 상점
 * 거래가 실제로 성사되는 다인 경제 관찰에 쓴다.
 *
 * @returns 표준 시나리오 배열
 */
export function standardScenarios(): SimScenario[] {
  const scenarios: SimScenario[] = []

  // 프로파일별 단독 — 1인 7일. 목표치(원/tick·손익분기·창고 병목) 검증축.
  for (const kind of ALL_PROFILE_KINDS) {
    scenarios.push(buildScenario({ userCount: 1, days: 7, profiles: [kind] }))
  }

  // 혼합 — 규모별. 유저 상점 거래가 성사되려면 최소 2명 이상이어야 한다.
  scenarios.push(buildScenario({ userCount: 10, days: 7 }))
  scenarios.push(buildScenario({ userCount: 100, days: 7 }))
  scenarios.push(buildScenario({ userCount: 10, days: 30 }))

  return scenarios
}
