/**
 * 주간 세금 — 자산 기반 누진세 순수 계산 모듈.
 *
 * 근거: docs/design/07-global-system.md §세금 시스템
 *  - 과세 대상: 주간 판매 수익 (마켓 판매 시)
 *  - 세율: 유저 글로벌 총자산 구간별 누진 (5% ~ 20%)
 *  - 서버 가산세: 관리자가 0 ~ +20%p 조정 (`Guild.taxSurcharge`)
 *  - 상한: 최대 세율 40% (누진 + 가산 합산 cap)
 *
 * 모든 비율은 1만분율(permyriad, bps) 정수로 다룬다 — float 곱셈 금지
 * (market/price.ts · tradeLog.ts 와 동일 관례).
 */

/** 1만분율 분모. 비율 → BigInt 정수 산술 환산 기준. */
const PPM_DENOMINATOR = 10_000n

/** float 비율 → 1만분율 환산 계수 (Number 산술용). */
const PPM_SCALE = 10_000

/**
 * 자산 구간별 누진 세율 테이블 (1만분율).
 *
 * 근거: docs/design/07-global-system.md §세율 — 자산 기반 누진세
 * | 0 ~ 100만 | 5% | · | 100만 ~ 1,000만 | 10% | · | 1,000만 ~ 1억 | 15% | · | 1억 이상 | 20% |
 *
 * 경계 규약: 하한 포함·상한 미포함 [min, max). "1억 **이상** 20%" 표기가
 * 앵커 — 정확히 1억이면 20%, 정확히 100만이면 10% 구간에 속한다.
 */
export const WEEKLY_TAX_BRACKETS: ReadonlyArray<{
  /** 구간 상한 자산 (미포함). null 은 무제한(최고 구간). */
  readonly maxAssetsExclusive: bigint | null
  /** 세율 (1만분율). 예: 5% → 500. */
  readonly rateBps: number
}> = [
  { maxAssetsExclusive: 1_000_000n, rateBps: 500 },
  { maxAssetsExclusive: 10_000_000n, rateBps: 1_000 },
  { maxAssetsExclusive: 100_000_000n, rateBps: 1_500 },
  { maxAssetsExclusive: null, rateBps: 2_000 },
]

/**
 * 합산 세율 상한 — 40% (1만분율).
 * 근거: docs/design/07-global-system.md §세율 "최대 세율 40% 유지".
 */
export const WEEKLY_TAX_CAP_BPS = 4_000

/**
 * 서버 가산세 상한 — +20%p (1만분율).
 * 근거: docs/design/07-global-system.md §세율 "세율 가산치(0 ~ +20%p)".
 */
export const TAX_SURCHARGE_MAX_BPS = 2_000

/**
 * 글로벌 총자산에 대응하는 누진 기본 세율(1만분율)을 반환한다.
 *
 * 근거: docs/design/07-global-system.md §세율 — 자산 기반 누진세.
 * 경계는 [min, max) — `WEEKLY_TAX_BRACKETS` 주석 참조.
 *
 * @param totalAssets 유저 글로벌 총자산 (>= 0)
 * @returns 기본 세율 (1만분율, 500 ~ 2000)
 * @throws {RangeError} totalAssets 가 음수인 경우
 */
export function baseTaxRateBps(totalAssets: bigint): number {
  if (totalAssets < 0n) {
    throw new RangeError(`totalAssets must be >= 0, got ${totalAssets}`)
  }
  for (const bracket of WEEKLY_TAX_BRACKETS) {
    if (bracket.maxAssetsExclusive === null || totalAssets < bracket.maxAssetsExclusive) {
      return bracket.rateBps
    }
  }
  // 도달 불가 — 마지막 구간이 maxAssetsExclusive=null. 타입 안전용 방어.
  throw new RangeError(`no tax bracket for assets ${totalAssets}`)
}

/**
 * `Guild.taxSurcharge`(float, 0~0.20)를 1만분율 정수로 환산한다.
 *
 * DB 컬럼이 Float 라 여기서 한 번만 반올림해 이후 산술을 정수로 고정한다.
 * 방어적으로 [0, {@link TAX_SURCHARGE_MAX_BPS}] 로 클램프한다 — 저장 경로
 * (`GuildService.updateTaxSurcharge`)가 이미 0~0.2 를 강제하지만, 세금 계산이
 * 손상 데이터로 cap 을 뚫으면 안 되기 때문
 * (docs/design/07-global-system.md §세율 "최대 세율 40% 유지").
 *
 * @param surcharge 서버 가산세 비율 (예: 0.1 = +10%p)
 * @returns 1만분율 정수 (0 ~ 2000)
 * @throws {RangeError} surcharge 가 유한수가 아닌 경우
 */
export function surchargeToBps(surcharge: number): number {
  if (!Number.isFinite(surcharge)) {
    throw new RangeError(`surcharge must be finite, got ${surcharge}`)
  }
  const bps = Math.round(surcharge * PPM_SCALE)
  if (bps < 0) return 0
  if (bps > TAX_SURCHARGE_MAX_BPS) return TAX_SURCHARGE_MAX_BPS
  return bps
}

/**
 * 유효 세율(1만분율) = min(누진 기본세율 + 서버 가산세, 40%).
 *
 * 누진 구간은 유저의 **글로벌 총자산** 기준, 가산세는 **판매가 발생한 서버**
 * 기준 — 서버별로 유효 세율이 달라진다 (docs/design/07-global-system.md
 * §과세 모델 상세, D-1 2026-07-03 확정).
 *
 * @param totalAssets 유저 글로벌 총자산 (>= 0)
 * @param surchargeBps 서버 가산세 (1만분율, {@link surchargeToBps} 산출값)
 * @returns 유효 세율 (1만분율, cap 4000)
 * @throws {RangeError} 입력 위반 시 (음수 자산, 음수/비정수 가산세)
 */
export function effectiveTaxRateBps(totalAssets: bigint, surchargeBps: number): number {
  if (!Number.isInteger(surchargeBps) || surchargeBps < 0) {
    throw new RangeError(`surchargeBps must be an integer >= 0, got ${surchargeBps}`)
  }
  const combined = baseTaxRateBps(totalAssets) + surchargeBps
  return Math.min(combined, WEEKLY_TAX_CAP_BPS)
}

/**
 * 주간 판매 수익에 유효 세율을 적용한 세액을 계산한다 (floor).
 *
 * `세액 = 수익 × 세율(bps) / 10000` — BigInt 정수 산술, 나눗셈은 마지막
 * 1회(floor)만 수행한다 (market/price.ts 관례).
 *
 * @param revenue 주간 판매 수익 (>= 0, gross)
 * @param rateBps 유효 세율 (1만분율, 0 ~ 4000)
 * @returns 세액 (bigint, floor)
 * @throws {RangeError} 입력 위반 시
 */
export function calcWeeklyTax(revenue: bigint, rateBps: number): bigint {
  if (revenue < 0n) {
    throw new RangeError(`revenue must be >= 0, got ${revenue}`)
  }
  if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > WEEKLY_TAX_CAP_BPS) {
    throw new RangeError(`rateBps must be an integer in [0, ${WEEKLY_TAX_CAP_BPS}], got ${rateBps}`)
  }
  return (revenue * BigInt(rateBps)) / PPM_DENOMINATOR
}
