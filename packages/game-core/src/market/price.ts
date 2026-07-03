/**
 * 글로벌 마켓 가격 변동 — 순수 계산 모듈.
 *
 * 30분 가격 tick 의 산식을 결정론적 함수로 제공한다. 랜덤 노이즈는 이 모듈이
 * 생성하지 않고 호출자(bot 서비스)가 주입한다 — 단위 테스트 결정성 보장.
 *
 * 산식 근거: docs/design/06-market.md §가격 산출 공식
 *
 * ```
 * newPrice = clamp(
 *   basePrice × (1 + noise) × (1 + demandFactor),
 *   basePrice × 0.70,
 *   basePrice × 2.00
 * )
 * noise        = Random(-0.20, +0.20)          // 호출자 주입
 * demandFactor = (recentSales - avgSales) / avgSales × k   // k = 보정 계수 (기본 0.1)
 * ```
 *
 * BigInt 정밀도: 비율 연산은 float 곱셈 대신 1만분율(permyriad) 정수 산술로
 * 수행한다 (apps/bot/src/services/tradeLog.ts 의 감쇠 계산과 동일 관례).
 * 나눗셈은 마지막에 한 번만 수행해 floor 반올림을 일관되게 유지한다.
 */

/** 1만분율(permyriad) 분모. 비율 → BigInt 정수 산술 환산 기준. */
const PPM_DENOMINATOR = 10_000n

/** float 비율 → 1만분율 환산 계수 (Number 산술용). */
const PPM_SCALE = 10_000

/**
 * 랜덤 노이즈 절대값 상한 — ±20%.
 * 근거: docs/design/06-market.md §가격 변동 "기본 변동 폭 ±20% (랜덤 노이즈)".
 */
export const PRICE_NOISE_LIMIT = 0.2

/**
 * 수요 보정 계수 k 의 기본값.
 * 근거: docs/design/06-market.md §가격 산출 공식 "k: 보정 계수 (예: 0.1)".
 */
export const DEFAULT_DEMAND_COEFFICIENT = 0.1

/**
 * 가격 하한 배율(1만분율) — 기준가의 70%.
 * 근거: docs/design/06-market.md §가격 변동 "가격 상하한: 기준가의 70% ~ 200%".
 */
export const PRICE_CLAMP_FLOOR_PPM = 7_000n

/**
 * 가격 상한 배율(1만분율) — 기준가의 200%.
 * 근거: docs/design/06-market.md §가격 변동 "가격 상하한: 기준가의 70% ~ 200%".
 */
export const PRICE_CLAMP_CEIL_PPM = 20_000n

/**
 * 유저 상점 등록가 하한 배율(1만분율) — 글로벌 현재가의 50%.
 * 근거: docs/design/06-market.md §유저 상점 규칙 "가격 제한: 글로벌 가격의 ±50% 범위".
 */
export const LISTING_PRICE_BAND_LOW_PPM = 5_000n

/**
 * 유저 상점 등록가 상한 배율(1만분율) — 글로벌 현재가의 150%.
 * 근거: docs/design/06-market.md §유저 상점 규칙 "가격 제한: 글로벌 가격의 ±50% 범위".
 */
export const LISTING_PRICE_BAND_HIGH_PPM = 15_000n

/**
 * 거래량 EMA 유지 가중치 — 직전 평균의 90% 를 유지한다.
 * `ema = ema×0.9 + recent×0.1` (#15 v1 결정 — 상수 기준선 대신 EMA 채택).
 */
export const AVG_SALES_EMA_KEEP_WEIGHT = 0.9

/**
 * 거래량 EMA 신규 표본 가중치 — 이번 윈도 거래량의 10% 를 반영한다.
 * `ema = ema×0.9 + recent×0.1` (#15 v1 결정).
 */
export const AVG_SALES_EMA_SAMPLE_WEIGHT = 0.1

/** `computeNextPrice` 입력. */
export interface ComputeNextPriceInput {
  /** 자재 기준가 (>= 1). 가격 진동의 앵커 — 현재가가 아니라 기준가 기준으로 재계산한다. */
  readonly basePrice: bigint
  /** 이번 30분 윈도의 누적 거래량 (>= 0 정수). */
  readonly recentSales: number
  /** 30분 윈도 거래량 EMA (>= 0). 0 이면 demandFactor 는 0 (U-5 가드). */
  readonly avgSales: number
  /** 랜덤 노이즈 비율. 호출자가 [-0.2, +0.2] 범위로 생성해 주입한다(범위 밖은 클램프). */
  readonly noise: number
  /** 수요 보정 계수 k (>= 0). 생략 시 {@link DEFAULT_DEMAND_COEFFICIENT}. */
  readonly demandCoefficient?: number
}

/** 유저 상점 등록가 허용 밴드 (경계 포함). */
export interface ListingPriceBand {
  /** 허용 최저 단가 (>= 1). */
  readonly min: bigint
  /** 허용 최고 단가. */
  readonly max: bigint
}

/**
 * 수요 계수(demandFactor)를 1만분율 정수로 계산한다.
 *
 * `demandFactor = (recentSales - avgSales) / avgSales × k`
 * (docs/design/06-market.md §가격 산출 공식).
 *
 * `avgSales <= 0` 이면 0 을 반환한다 — 0-나눗셈 가드 (#15 U-5 확정:
 * "avgSales=0 → demandFactor 0"). 비율 계산은 Number 로 수행하되 결과를
 * 1만분율 정수로 한 번만 반올림해 이후 BigInt 산술의 결정성을 보장한다.
 *
 * @param recentSales 이번 윈도 누적 거래량 (>= 0 정수)
 * @param avgSales 거래량 EMA (>= 0)
 * @param demandCoefficient 보정 계수 k (>= 0, 기본 0.1)
 * @returns 1만분율 정수 demandFactor (예: +10% → 1000n)
 * @throws {RangeError} 입력이 음수·비유한·비정수(recentSales)인 경우
 */
export function computeDemandFactorPpm(
  recentSales: number,
  avgSales: number,
  demandCoefficient: number = DEFAULT_DEMAND_COEFFICIENT,
): bigint {
  assertNonNegativeInteger(recentSales, 'recentSales')
  assertNonNegativeFinite(avgSales, 'avgSales')
  assertNonNegativeFinite(demandCoefficient, 'demandCoefficient')

  if (avgSales <= 0) return 0n

  const ratio = (recentSales - avgSales) / avgSales
  return BigInt(Math.round(ratio * demandCoefficient * PPM_SCALE))
}

/**
 * 다음 30분 tick 의 자재 가격을 계산한다.
 *
 * `newPrice = clamp(basePrice × (1+noise) × (1+demandFactor), basePrice×0.70, basePrice×2.00)`
 * (docs/design/06-market.md §가격 산출 공식).
 *
 * 구현 규약:
 *  - noise 는 1만분율 정수로 반올림 후 [-2000, +2000] 으로 클램프한다
 *    (±20% — 스케줄 잡이 노이즈 생성기 버그로 죽지 않도록 방어적 클램프).
 *  - 배율 곱은 전부 BigInt 정수 산술, 나눗셈(floor)은 마지막 1회만 수행한다
 *    — 중간 반올림 누적을 없애 결과가 결정적이다.
 *  - 하한은 `floor(basePrice×0.7)`, 상한은 `basePrice×2`. 하한이 0 으로
 *    내려가는 극소 기준가(basePrice=1)에서는 최저 1 로 보정한다(가격 0 방지).
 *
 * @returns 다음 tick 의 currentPrice (bigint, >= 1)
 * @throws {RangeError} basePrice < 1, 음수/비유한 입력 등 위반 시
 */
export function computeNextPrice(input: ComputeNextPriceInput): bigint {
  const { basePrice, recentSales, avgSales, noise } = input
  const demandCoefficient = input.demandCoefficient ?? DEFAULT_DEMAND_COEFFICIENT

  if (basePrice < 1n) {
    throw new RangeError(`basePrice must be >= 1, got ${basePrice}`)
  }
  if (!Number.isFinite(noise)) {
    throw new RangeError(`noise must be finite, got ${noise}`)
  }

  const noisePpm = clampBigInt(
    BigInt(Math.round(noise * PPM_SCALE)),
    -noiseLimitPpm(),
    noiseLimitPpm(),
  )
  const demandPpm = computeDemandFactorPpm(recentSales, avgSales, demandCoefficient)

  // basePrice × (1+noise) × (1+demand) — 나눗셈은 마지막 한 번(floor).
  const raw =
    (basePrice * (PPM_DENOMINATOR + noisePpm) * (PPM_DENOMINATOR + demandPpm)) /
    (PPM_DENOMINATOR * PPM_DENOMINATOR)

  const floor = maxBigInt((basePrice * PRICE_CLAMP_FLOOR_PPM) / PPM_DENOMINATOR, 1n)
  const ceil = (basePrice * PRICE_CLAMP_CEIL_PPM) / PPM_DENOMINATOR
  return clampBigInt(raw, floor, ceil)
}

/**
 * 다음 tick 의 거래량 EMA 를 계산한다.
 *
 * `ema = ema×0.9 + recent×0.1` — 30분 윈도마다 신규 표본을 10% 반영한다.
 * 상수 기준선(v1 이슈 본문 초안) 대신 EMA 를 채택해 유저 규모 변화에 수요
 * 기준선이 자동 적응하도록 한다 (#15 스코프 갱신 반영).
 *
 * EMA 는 화폐가 아닌 통계치이므로 Number(float) 산술을 사용한다 —
 * `GlobalMarketPrice.avgSales`(Float 컬럼)와 표현을 일치시킨다.
 *
 * @param avgSales 직전 EMA (>= 0)
 * @param recentSales 이번 윈도 누적 거래량 (>= 0 정수)
 * @returns 갱신된 EMA (>= 0)
 * @throws {RangeError} 음수·비유한·비정수(recentSales) 입력 시
 */
export function computeNextAvgSales(avgSales: number, recentSales: number): number {
  assertNonNegativeFinite(avgSales, 'avgSales')
  assertNonNegativeInteger(recentSales, 'recentSales')
  return avgSales * AVG_SALES_EMA_KEEP_WEIGHT + recentSales * AVG_SALES_EMA_SAMPLE_WEIGHT
}

/**
 * 유저 상점 등록가 허용 밴드를 계산한다 — 글로벌 현재가의 ±50% (경계 포함).
 *
 * 근거: docs/design/06-market.md §유저 상점 규칙 "가격 제한: 글로벌 가격의
 * ±50% 범위만 허용". 등록 시점과 구매 시점 모두 이 밴드로 재검증한다
 * (#15 확정 — 30분 변동으로 등록 후 적법 범위 이탈 가능).
 *
 * 상·하한 모두 floor 나눗셈으로 일관 처리하며, 하한은 최저 1 로 보정한다
 * (currentPrice=1 인 극소가에서 하한 0 방지 — 단가 하한 규칙과 정합).
 *
 * @param currentPrice 글로벌 마켓 현재가 (>= 1)
 * @returns 허용 밴드 { min, max }
 * @throws {RangeError} currentPrice < 1 인 경우
 */
export function listingPriceBand(currentPrice: bigint): ListingPriceBand {
  if (currentPrice < 1n) {
    throw new RangeError(`currentPrice must be >= 1, got ${currentPrice}`)
  }
  const min = maxBigInt((currentPrice * LISTING_PRICE_BAND_LOW_PPM) / PPM_DENOMINATOR, 1n)
  const max = (currentPrice * LISTING_PRICE_BAND_HIGH_PPM) / PPM_DENOMINATOR
  return { min, max }
}

/** 노이즈 상한(±20%)의 1만분율 표현 — ±2000. */
function noiseLimitPpm(): bigint {
  return BigInt(Math.round(PRICE_NOISE_LIMIT * PPM_SCALE))
}

/** BigInt 3항 클램프. */
function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min
  if (value > max) return max
  return value
}

/** BigInt 두 값 중 큰 값. */
function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

/** 음수/비유한 방어 — 실패 시 RangeError. */
function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite number >= 0, got ${value}`)
  }
}

/** 음수/비정수 방어 — 실패 시 RangeError. */
function assertNonNegativeInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be an integer >= 0, got ${value}`)
  }
}
