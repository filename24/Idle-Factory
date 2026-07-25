/**
 * 플레이 프로파일 정의 — 접속 주기·재투자 성향의 표준 3분류 (#31 §시나리오 정의).
 *
 * 수치는 설계 문서가 아니라 **시뮬레이션 가정치**다. 설계 목표(300~400원/tick,
 * 33분 손익분기, 창고 1등급 16시간)를 서로 다른 플레이 패턴에서 재보는 것이
 * 목적이므로, 프로파일 자체는 검증 대상이 아니라 검증 조건이다.
 *
 * 근거가 있는 부분만 문서를 인용한다:
 *  - 1 tick = 10분 (`TICK_MS`, docs/design/02-core-loop.md)
 *  - 창고 1등급이 "초기 공장 1개 기준 약 16시간치"라 하루 1회 접속(IDLE)이
 *    병목을 정면으로 맞는 축이다 (docs/design/05-warehouse.md §설계 의도)
 *  - 유저 상점 등록 기간별 세율 3~18% (docs/design/06-market.md §기간별 세율 테이블)
 */

import type { PlayProfile, PlayProfileKind } from './types'

/** 하루의 tick 수 — 24h × 6 tick/h. `TICK_MS`(10분)에서 유도. */
export const TICKS_PER_DAY = 144

/** 한 주의 tick 수 — 주간 세금 정산 주기 (docs/design/07-global-system.md §세금). */
export const TICKS_PER_WEEK = TICKS_PER_DAY * 7

/**
 * 가격 재계산 주기 (tick). 30분 = 3 tick.
 * 근거: docs/design/06-market.md §가격 변동 "30분마다 모든 자재 가격 재계산"
 * (런타임 대응: `apps/bot/src/scheduled-tasks/market-price-tick.ts`).
 */
export const PRICE_TICK_INTERVAL = 3

/**
 * 표준 플레이 프로파일 3종.
 *
 * `shopSellRatio` 가 0 인 프로파일은 전량을 글로벌 마켓에 즉시 판매한다 —
 * 글로벌 판매는 시스템이 대금을 지급하므로 **통화 발행**이고, 유저 상점은
 * 유저 간 이전이라 총량이 늘지 않는다. 이 비중이 인플레율의 1차 결정 변수다.
 */
export const PLAY_PROFILES: Readonly<Record<PlayProfileKind, PlayProfile>> = {
  HARDCORE: {
    kind: 'HARDCORE',
    label: '하드코어(10분마다 수확·즉시 재투자)',
    sessionIntervalTicks: 1,
    reinvestRatio: 1.0,
    shopSellRatio: 0,
    listingDurationDays: 3,
  },
  CASUAL: {
    kind: 'CASUAL',
    label: '캐주얼(하루 3회 접속)',
    sessionIntervalTicks: 48,
    reinvestRatio: 0.7,
    shopSellRatio: 0.3,
    listingDurationDays: 7,
  },
  IDLE: {
    kind: 'IDLE',
    label: '방치(하루 1회 접속)',
    sessionIntervalTicks: TICKS_PER_DAY,
    reinvestRatio: 0.5,
    shopSellRatio: 0,
    listingDurationDays: 14,
  },
}

/**
 * 프로파일 종류로 정의를 조회한다.
 *
 * @param kind 프로파일 종류
 * @returns 프로파일 정의 (불변)
 */
export function getPlayProfile(kind: PlayProfileKind): PlayProfile {
  return PLAY_PROFILES[kind]
}

/** 전 프로파일 종류 목록 — 시나리오 기본값·리포트 순회용. */
export const ALL_PROFILE_KINDS: readonly PlayProfileKind[] = ['HARDCORE', 'CASUAL', 'IDLE']
