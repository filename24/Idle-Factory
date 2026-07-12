/**
 * 서버 신뢰도(Credit) 순수 계산 모음.
 *
 * 신뢰도는 서버 단위로 관리되는 0~2000 범위의 점수로, 구간(티어)에 따라
 * 기능 제한·공장 최대 등급·경험치 보너스·긴급 지원금 자격이 결정된다.
 * 이 모듈은 DB/네트워크 의존성이 없는 순수 함수·상수만 제공한다.
 *
 * 공식 근거: `docs/design/07-global-system.md` §신뢰도 시스템,
 *           §신뢰도 효과, §신뢰도 변동, §비활성 서버 자산 분배.
 * 등급 상한 근거: `docs/design/03-factories.md` §등급 시스템.
 */

/** 신뢰도 하한. 근거: `docs/design/07-global-system.md` §신뢰도 시스템 (범위 0 ~ 2,000). */
export const CREDIT_MIN = 0
/** 신뢰도 상한. 근거: `docs/design/07-global-system.md` §신뢰도 시스템 (상한 clamp 2,000). */
export const CREDIT_MAX = 2000
/** 서버 가입 시 기본 신뢰도. 근거: `docs/design/07-global-system.md` §신뢰도 시스템 (기본값 1,000pt). */
export const CREDIT_DEFAULT = 1000

/**
 * 신뢰도 구간(티어).
 *
 * 근거: `docs/design/07-global-system.md` §신뢰도 효과 (구간별).
 * - `RESTRICTED` 0~299: 대부분 기능 제한 + 긴급 지원금 대상
 * - `LIMITED` 300~699: 일부 기능 제한 (유저 상점 등록 불가 등)
 * - `NORMAL` 700~999: 정상 운영
 * - `TRUSTED` 1000~1499: 공장 최대 등급 +1, 경험치 +10%
 * - `ELITE` 1500+: 글로벌 주식 참여, 공장 최대 등급 +2, 경험치 +20%
 */
export type CreditTier = 'RESTRICTED' | 'LIMITED' | 'NORMAL' | 'TRUSTED' | 'ELITE'

/** `LIMITED` 구간 시작점(이 값 미만은 `RESTRICTED`). 근거: 07 §신뢰도 효과. */
const TIER_LIMITED_MIN = 300
/** `NORMAL` 구간 시작점. 근거: 07 §신뢰도 효과. */
const TIER_NORMAL_MIN = 700
/** `TRUSTED` 구간 시작점. 근거: 07 §신뢰도 효과. */
const TIER_TRUSTED_MIN = 1000
/** `ELITE` 구간 시작점. 근거: 07 §신뢰도 효과. */
const TIER_ELITE_MIN = 1500

/**
 * 신뢰도 값이 속한 구간(티어)을 반환한다.
 *
 * 경계는 하한 포함(inclusive): 300→`LIMITED`, 700→`NORMAL`, 1000→`TRUSTED`, 1500→`ELITE`.
 * 근거: `docs/design/07-global-system.md` §신뢰도 효과.
 *
 * @param credit 신뢰도 값 (0~2000; 범위 밖도 최근접 구간으로 처리)
 * @returns 해당 구간
 */
export function getCreditTier(credit: number): CreditTier {
  if (credit >= TIER_ELITE_MIN) return 'ELITE'
  if (credit >= TIER_TRUSTED_MIN) return 'TRUSTED'
  if (credit >= TIER_NORMAL_MIN) return 'NORMAL'
  if (credit >= TIER_LIMITED_MIN) return 'LIMITED'
  return 'RESTRICTED'
}

/** 매주 자연 감쇠량(활성도가 없으면 하락). 근거: `docs/design/07-global-system.md` §신뢰도 변동 (baselineDecay = 10). */
const BASELINE_DECAY = 10
/** DAU → 신뢰도 환산 계수. 근거: `docs/design/07-global-system.md` §신뢰도 변동 (weeklyDAU × 0.5). */
const DAU_CREDIT_FACTOR = 0.5

/**
 * 주간 정산 시 활성도(DAU)로 산정되는 신뢰도 증감량.
 *
 * 공식: `delta = floor(weeklyDAU × 0.5) − 10`.
 * 근거: `docs/design/07-global-system.md` §신뢰도 변동.
 *
 * @example
 * weeklyCreditDelta(20) // 0   (DAU 20 → +10 − 10)
 * weeklyCreditDelta(40) // +10 (DAU 40 → +20 − 10)
 * weeklyCreditDelta(5)  // -8  (DAU 5  → +2  − 10)
 * weeklyCreditDelta(0)  // -10 (DAU 0  → 0   − 10)
 *
 * @param weeklyDAU 주간 활성 유저 수 (0 이상)
 * @returns 신뢰도 증감량 (정수, 음수 가능)
 */
export function weeklyCreditDelta(weeklyDAU: number): number {
  return Math.floor(weeklyDAU * DAU_CREDIT_FACTOR) - BASELINE_DECAY
}

/**
 * 신뢰도에 증감량을 적용하고 0~2000 범위로 clamp한다.
 *
 * 근거: `docs/design/07-global-system.md` §신뢰도 시스템 (범위 0 ~ 2,000, 상한 clamp).
 *
 * @param credit 현재 신뢰도
 * @param delta 증감량 (음수 가능)
 * @returns clamp된 신규 신뢰도 (0~2000)
 */
export function applyCreditDelta(credit: number, delta: number): number {
  const next = credit + delta
  if (next < CREDIT_MIN) return CREDIT_MIN
  if (next > CREDIT_MAX) return CREDIT_MAX
  return next
}

/** 세금 미납 시 일일 신뢰도 패널티. 근거: `docs/design/07-global-system.md` §신뢰도 변동 (금고 부족 시 매일 -10). */
export const UNPAID_DAILY_PENALTY = -10

/** 신뢰도 버프 없이 도달 가능한 공장 기본 최대 등급. 근거: 이슈 #17 확정 결정 1 (기본 상한 8). */
export const BASE_MAX_GRADE = 8
/** 등급 체계 절대 상한. 근거: `docs/design/03-factories.md` §등급 시스템 (1~10 등급). */
export const ABSOLUTE_MAX_GRADE = 10

/**
 * 신뢰도에 따른 공장 유효 최대 등급.
 *
 * 기본 상한 8에서 신뢰도 1000+ → +1(9), 1500+ → +2(10). 절대 상한 10.
 * 근거: 이슈 #17 확정 결정 1, `docs/design/07-global-system.md` §신뢰도 효과.
 *
 * @example
 * effectiveMaxGrade(999)  // 8
 * effectiveMaxGrade(1000) // 9
 * effectiveMaxGrade(1500) // 10
 *
 * @param credit 서버 신뢰도
 * @returns 유효 최대 등급 (8 | 9 | 10)
 */
export function effectiveMaxGrade(credit: number): number {
  if (credit >= TIER_ELITE_MIN) return ABSOLUTE_MAX_GRADE
  if (credit >= TIER_TRUSTED_MIN) return BASE_MAX_GRADE + 1
  return BASE_MAX_GRADE
}

/** TRUSTED(1000~1499) 구간 XP 보너스 (bps, 1만분율). +10% = 1000bps. 근거: 07 §신뢰도 효과. */
const XP_BONUS_TRUSTED_BPS = 1000
/** ELITE(1500+) 구간 XP 보너스 (bps, 1만분율). +20% = 2000bps. 근거: 07 §신뢰도 효과. */
const XP_BONUS_ELITE_BPS = 2000

/**
 * 신뢰도에 따른 XP 보너스 배율(bps, 1만분율).
 *
 * 1000+ → +10%(1000bps), 1500+ → +20%(2000bps), 그 외 0.
 * BigInt 정수 연산: `xp × (10000 + bonusBps) / 10000n`.
 * 근거: `docs/design/07-global-system.md` §신뢰도 효과, 이슈 #17 확정 결정 6.
 *
 * @param credit 서버 신뢰도
 * @returns XP 보너스 (bps: 0 | 1000 | 2000)
 */
export function creditXpBonusBps(credit: number): number {
  if (credit >= TIER_ELITE_MIN) return XP_BONUS_ELITE_BPS
  if (credit >= TIER_TRUSTED_MIN) return XP_BONUS_TRUSTED_BPS
  return 0
}

/** 긴급 지원금 상한(= 글로벌 은행 보전 목표 금고액). 근거: `docs/design/07-global-system.md` §신뢰도 효과 (최대 100만원). */
export const EMERGENCY_SUPPORT_CAP = 1_000_000n
/** 긴급 지원금 발동 신뢰도 임계값(이 값 미만 = RESTRICTED). 근거: 07 §신뢰도 효과 (0~300 구간). */
export const EMERGENCY_CREDIT_THRESHOLD = 300

/** 비활성 서버 자산 수집 트리거 경과 일수. 근거: `docs/design/07-global-system.md` §비활성 서버 자산 분배 (퇴장 후 30일). */
export const INACTIVE_DAYS = 30

/** 재분배 수혜 자격 신뢰도 하한. 근거: `docs/design/07-global-system.md` §비활성 서버 자산 분배 (신뢰도 ≥ 300). */
export const REDISTRIBUTION_CREDIT_MIN = 300
/** 재분배액 중 서버 금고 배분 비율(bps, 1만분율). 70% vault / 30% 유저. 근거: 07 §비활성 서버 자산 분배 (70:30). */
export const REDISTRIBUTION_VAULT_RATIO_BPS = 7000

/**
 * 비활성 서버 자산 월간 분배 시 서버별 가중치.
 *
 * 공식: `weight = weeklyDAU + ln(vault + 1)` (자연로그).
 * `vault`가 0이면 `ln(1) = 0`이므로 `weight = weeklyDAU`.
 * 근거: `docs/design/07-global-system.md` §비활성 서버 자산 분배 (분배 공식),
 *      이슈 #17 확정 결정 5.
 *
 * @param weeklyDAU 서버 주간 활성 유저 수 (0 이상)
 * @param vault 서버 금고 잔액 (BigInt, 0 이상)
 * @returns 분배 가중치 (실수)
 */
export function redistributionWeight(weeklyDAU: number, vault: bigint): number {
  return weeklyDAU + Math.log(Number(vault) + 1)
}
