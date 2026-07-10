/**
 * 주식 가격 — 순수 계산 모듈.
 *
 * IPO 가격·1시간 주가 tick·주당 배당금의 산식을 결정론적 함수로 제공한다.
 * DB 집계(거래량·수익 합산)와 시각 판정(당일 첫 tick)은 호출자(bot 서비스)가
 * 수행해 인자로 주입한다 — 단위 테스트 결정성 보장 (market/price.ts 관례).
 *
 * 산식 근거: docs/design/08-stock.md §주가 결정, §배당 시스템
 *
 * ```
 * defaultIPO = (totalAssets + recent30dProfit × 10) / sharesOutstanding
 * finalIPO   = clamp(userSetPrice, defaultIPO × 0.30, defaultIPO × 0.70)
 *
 * newPrice = prevPrice × (1 + demandPressure + profitDelta × 0.3)
 * demandPressure = (buyVolume - sellVolume) / totalVolume × 0.1
 * profitDelta    = (last24hProfit - avg7dProfit) / avg7dProfit
 * 서킷브레이커: 당일 기준가(dayOpenPrice) ±30% clamp (D10)
 *
 * eachShareDividend = (weeklyProfit × dividendRate) / sharesOutstanding
 * ```
 *
 * BigInt 정밀도: 비율 연산은 float 곱셈 대신 1만분율(permyriad) 정수 산술로
 * 수행한다 (market/price.ts 와 동일 관례). 나눗셈은 마지막에 한 번만 수행해
 * floor(0 방향 절사) 반올림을 일관되게 유지한다.
 */

/** 1만분율(permyriad) 분모. 비율 → BigInt 정수 산술 환산 기준. */
const PPM_DENOMINATOR = 10_000n

/**
 * 기본 발행 주식 수 — 100주.
 * 근거: docs/design/08-stock.md §IPO 가격 "sharesOutstanding = 100 (기본 발행 주식 수)".
 */
export const DEFAULT_SHARES_OUTSTANDING = 100

/**
 * recent30dProfit 가중 배수 — ×10.
 * 근거: docs/design/08-stock.md §IPO 가격 "defaultIPO = (totalAssets + recent30dProfit × 10) / sharesOutstanding".
 */
export const IPO_PROFIT_MULTIPLIER = 10n

/**
 * IPO 유저 설정가 하한 배율(1만분율) — 기본가의 30%.
 * 근거: docs/design/08-stock.md §IPO 최종가 "기본값의 30~70% 범위".
 */
export const IPO_PRICE_FLOOR_PPM = 3_000n

/**
 * IPO 유저 설정가 상한 배율(1만분율) — 기본가의 70%.
 * 근거: docs/design/08-stock.md §IPO 최종가 "기본값의 30~70% 범위".
 */
export const IPO_PRICE_CEIL_PPM = 7_000n

/**
 * 수요 압력 보정 계수(1만분율) — 0.1.
 * 근거: docs/design/08-stock.md §주가 변동 "demandPressure = (buyVolume - sellVolume) / totalVolume × 0.1".
 */
export const STOCK_DEMAND_COEFFICIENT_PPM = 1_000n

/**
 * 수익 변화율 가중치(1만분율) — 0.3.
 * 근거: docs/design/08-stock.md §주가 변동 "newPrice = prevPrice × (1 + demandPressure + profitDelta × 0.3)".
 */
export const PROFIT_DELTA_WEIGHT_PPM = 3_000n

/**
 * 서킷브레이커 일일 변동 폭(1만분율) — ±30%.
 * 기준가는 해당 KST 일의 첫 StockPriceTick 가격(없으면 직전 종가
 * `Stock.currentPrice`) — D10 확정.
 * 근거: docs/design/08-stock.md §주가 변동 "서킷브레이커: 일일 ±30% clamp".
 */
export const DAILY_CIRCUIT_BREAKER_PPM = 3_000n

/**
 * 기본 배당률(1만분율) — 10% (`Stock.dividendRatePpm` 기본값과 동일).
 * 근거: docs/design/08-stock.md §배당 시스템 "배당 재원 = 해당 회사의 주간 수익의 10%".
 */
export const DEFAULT_DIVIDEND_RATE_PPM = 1_000

/** `computeDefaultIpoPrice` 입력. */
export interface ComputeDefaultIpoPriceInput {
  /** 상장 유저 총자산 (`evaluateTotalAssets` 결과, >= 0). */
  readonly totalAssets: bigint
  /**
   * 최근 30일 수익 (>= 0). v0 은 항상 0n — 상장 전에는 StockProfitLog 수익
   * 이력이 없어 집계가 불가능하다 (D7 확정: v0 단순화).
   */
  readonly recent30dProfit: bigint
  /** 발행 주식 수 (>= 1 정수). 생략 시 {@link DEFAULT_SHARES_OUTSTANDING}. */
  readonly sharesOutstanding?: number
}

/** `computeNextStockPrice` 입력. */
export interface ComputeNextStockPriceInput {
  /** 직전 주가 (`Stock.currentPrice`, >= 1). */
  readonly prevPrice: bigint
  /** 최근 1시간 매수 체결 주수 합 (>= 0). TradeLog(stockId, STOCK_BUY) 집계 — D9. */
  readonly buyVolume: bigint
  /** 최근 1시간 매도 체결 주수 합 (>= 0). TradeLog(stockId, STOCK_SELL) 집계 — D9. */
  readonly sellVolume: bigint
  /** 최근 24시간 수익 합 (>= 0). StockProfitLog 집계 — D9. */
  readonly last24hProfit: bigint
  /** 최근 7일 일평균 수익 (>= 0). 0 이면 profitDelta 는 0 (U-5 가드). */
  readonly avg7dProfit: bigint
  /**
   * 서킷브레이커 기준가 (>= 1) — 해당 KST 일의 첫 StockPriceTick 가격,
   * 당일 tick 이 없으면 직전 종가(`Stock.currentPrice`) (D10 확정).
   */
  readonly dayOpenPrice: bigint
  /** 수요 보정 계수(1만분율, >= 0). 생략 시 {@link STOCK_DEMAND_COEFFICIENT_PPM}. */
  readonly demandCoefficientPpm?: bigint
  /** 수익 변화율 가중치(1만분율, >= 0). 생략 시 {@link PROFIT_DELTA_WEIGHT_PPM}. */
  readonly profitDeltaWeightPpm?: bigint
}

/** `computeDividendPerShare` 입력. */
export interface ComputeDividendPerShareInput {
  /** 해당 주의 누적 수익 (`Stock.weeklyProfit`, >= 0). */
  readonly weeklyProfit: bigint
  /** 발행 주식 수 (>= 1 정수). */
  readonly sharesOutstanding: number
  /** 배당률(1만분율, 0..10000 정수). 생략 시 {@link DEFAULT_DIVIDEND_RATE_PPM}. */
  readonly dividendRatePpm?: number
}

/**
 * IPO 기본가를 계산한다.
 *
 * `defaultIPO = (totalAssets + recent30dProfit × 10) / sharesOutstanding`
 * (docs/design/08-stock.md §IPO 가격 — 기본 공식). 나눗셈은 마지막 1회 floor.
 *
 * v0 은 `recent30dProfit = 0` 으로 호출한다 — 상장 전 수익 이력이 없어
 * 집계 불가 (D7 확정). 극소 자산에서 0 으로 떨어지지 않도록 최저 1 로
 * 보정한다(가격 0 방지 — market/price.ts 하한 보정과 동일 관례).
 *
 * @param input 총자산·최근 30일 수익·발행 주식 수
 * @returns IPO 기본가 (bigint, >= 1)
 * @throws {RangeError} 음수 BigInt 또는 sharesOutstanding 이 1 미만/비정수인 경우
 */
export function computeDefaultIpoPrice(input: ComputeDefaultIpoPriceInput): bigint {
  const { totalAssets, recent30dProfit } = input
  const sharesOutstanding = input.sharesOutstanding ?? DEFAULT_SHARES_OUTSTANDING

  assertNonNegativeBigInt(totalAssets, 'totalAssets')
  assertNonNegativeBigInt(recent30dProfit, 'recent30dProfit')
  assertPositiveInteger(sharesOutstanding, 'sharesOutstanding')

  const raw = (totalAssets + recent30dProfit * IPO_PROFIT_MULTIPLIER) / BigInt(sharesOutstanding)
  return maxBigInt(raw, 1n)
}

/**
 * 유저가 설정한 IPO 가격을 허용 범위(기본가의 30~70%)로 클램프한다.
 *
 * `finalIPO = clamp(userSetPrice, defaultIPO × 0.30, defaultIPO × 0.70)`
 * (docs/design/08-stock.md §IPO 최종가 — "고/저평가 극단 방지 + 유저 선택권 보장").
 *
 * 상·하한 모두 floor 나눗셈으로 계산하며, 극소 기본가에서 0 으로 떨어지지
 * 않도록 각각 최저 1 로 보정한다(가격 0 방지).
 *
 * @param userSetPrice 유저가 입력한 IPO 가격 (>= 1)
 * @param defaultIpoPrice {@link computeDefaultIpoPrice} 결과 (>= 1)
 * @returns 클램프된 최종 IPO 가격 (bigint, >= 1)
 * @throws {RangeError} userSetPrice 또는 defaultIpoPrice 가 1 미만인 경우
 */
export function clampIpoPrice(userSetPrice: bigint, defaultIpoPrice: bigint): bigint {
  if (userSetPrice < 1n) {
    throw new RangeError(`userSetPrice must be >= 1, got ${userSetPrice}`)
  }
  if (defaultIpoPrice < 1n) {
    throw new RangeError(`defaultIpoPrice must be >= 1, got ${defaultIpoPrice}`)
  }
  const floor = maxBigInt((defaultIpoPrice * IPO_PRICE_FLOOR_PPM) / PPM_DENOMINATOR, 1n)
  const ceil = maxBigInt((defaultIpoPrice * IPO_PRICE_CEIL_PPM) / PPM_DENOMINATOR, 1n)
  return clampBigInt(userSetPrice, floor, ceil)
}

/**
 * 다음 1시간 tick 의 주가를 계산한다.
 *
 * `newPrice = clamp(prevPrice × (1 + demandPressure + profitDelta × 0.3),
 *                   dayOpenPrice × 0.70, dayOpenPrice × 1.30)`
 * (docs/design/08-stock.md §주가 변동 — 1시간 주기 + 서킷브레이커 일일 ±30%).
 *
 * 구현 규약:
 *  - `demandPressure = (buyVolume - sellVolume) / totalVolume × 0.1` —
 *    `totalVolume = 0` 이면 0 (U-5 0-나눗셈 가드, 2026-07-03 확정).
 *  - `profitDelta = (last24hProfit - avg7dProfit) / avg7dProfit` —
 *    `avg7dProfit = 0` 이면 0 (U-5 가드). 가중치 0.3 을 분자에 선곱해
 *    나눗셈을 1회로 유지한다.
 *  - 배율 곱은 전부 BigInt 정수 산술, 나눗셈은 항마다 마지막 1회만 수행한다
 *    (음수 분자는 0 방향 절사 — BigInt `/` 규약, 결정적).
 *  - 서킷브레이커 기준가는 prevPrice 가 아니라 **당일 첫 tick 가격**(없으면
 *    직전 종가 `currentPrice`)이다 — D10 확정. 하한은 최저 1 로 보정한다
 *    (가격 0 방지).
 *
 * @param input 직전가·수급 집계·수익 집계·당일 기준가
 * @returns 다음 tick 의 currentPrice (bigint, >= 1)
 * @throws {RangeError} prevPrice/dayOpenPrice < 1, 음수 집계값 입력 시
 */
export function computeNextStockPrice(input: ComputeNextStockPriceInput): bigint {
  const { prevPrice, buyVolume, sellVolume, last24hProfit, avg7dProfit, dayOpenPrice } = input
  const demandCoefficientPpm = input.demandCoefficientPpm ?? STOCK_DEMAND_COEFFICIENT_PPM
  const profitDeltaWeightPpm = input.profitDeltaWeightPpm ?? PROFIT_DELTA_WEIGHT_PPM

  if (prevPrice < 1n) {
    throw new RangeError(`prevPrice must be >= 1, got ${prevPrice}`)
  }
  if (dayOpenPrice < 1n) {
    throw new RangeError(`dayOpenPrice must be >= 1, got ${dayOpenPrice}`)
  }
  assertNonNegativeBigInt(buyVolume, 'buyVolume')
  assertNonNegativeBigInt(sellVolume, 'sellVolume')
  assertNonNegativeBigInt(last24hProfit, 'last24hProfit')
  assertNonNegativeBigInt(avg7dProfit, 'avg7dProfit')
  assertNonNegativeBigInt(demandCoefficientPpm, 'demandCoefficientPpm')
  assertNonNegativeBigInt(profitDeltaWeightPpm, 'profitDeltaWeightPpm')

  // demandPressure(1만분율) — totalVolume=0 → 0 (U-5 가드).
  const totalVolume = buyVolume + sellVolume
  const demandPpm =
    totalVolume === 0n ? 0n : ((buyVolume - sellVolume) * demandCoefficientPpm) / totalVolume

  // profitDelta × 0.3 (1만분율) — avg7dProfit=0 → 0 (U-5 가드).
  const profitPpm =
    avg7dProfit === 0n ? 0n : ((last24hProfit - avg7dProfit) * profitDeltaWeightPpm) / avg7dProfit

  // prevPrice × (1 + demand + profit×0.3) — 나눗셈은 마지막 한 번(floor).
  const raw = (prevPrice * (PPM_DENOMINATOR + demandPpm + profitPpm)) / PPM_DENOMINATOR

  const floor = maxBigInt(
    (dayOpenPrice * (PPM_DENOMINATOR - DAILY_CIRCUIT_BREAKER_PPM)) / PPM_DENOMINATOR,
    1n,
  )
  const ceil = maxBigInt(
    (dayOpenPrice * (PPM_DENOMINATOR + DAILY_CIRCUIT_BREAKER_PPM)) / PPM_DENOMINATOR,
    1n,
  )
  return clampBigInt(raw, floor, ceil)
}

/**
 * 주당 배당금을 계산한다.
 *
 * `eachShareDividend = (weeklyProfit × dividendRate) / sharesOutstanding`
 * (docs/design/08-stock.md §배당 시스템 — 배당 재원은 주간 수익의 10%).
 * 유저별 지급액은 `주당 배당금 × 보유 주수` 로 호출자가 계산한다.
 *
 * 배당률 곱과 발행 주수 나눗셈을 한 번의 floor 나눗셈으로 처리해 중간
 * 반올림 누적을 없앤다. 결과가 0 일 수 있다(주간 수익이 극소인 종목).
 *
 * @param input 주간 수익·발행 주수·배당률(1만분율)
 * @returns 주당 배당금 (bigint, >= 0)
 * @throws {RangeError} weeklyProfit 음수, sharesOutstanding < 1,
 *   dividendRatePpm 이 0..10000 밖 정수가 아닌 경우
 */
export function computeDividendPerShare(input: ComputeDividendPerShareInput): bigint {
  const { weeklyProfit, sharesOutstanding } = input
  const dividendRatePpm = input.dividendRatePpm ?? DEFAULT_DIVIDEND_RATE_PPM

  assertNonNegativeBigInt(weeklyProfit, 'weeklyProfit')
  assertPositiveInteger(sharesOutstanding, 'sharesOutstanding')
  if (!Number.isInteger(dividendRatePpm) || dividendRatePpm < 0 || dividendRatePpm > 10_000) {
    throw new RangeError(`dividendRatePpm must be an integer in 0..10000, got ${dividendRatePpm}`)
  }

  return (weeklyProfit * BigInt(dividendRatePpm)) / (PPM_DENOMINATOR * BigInt(sharesOutstanding))
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

/** BigInt 음수 방어 — 실패 시 RangeError. */
function assertNonNegativeBigInt(value: bigint, name: string): void {
  if (value < 0n) {
    throw new RangeError(`${name} must be >= 0, got ${value}`)
  }
}

/** 양의 정수(Number) 방어 — 실패 시 RangeError. */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be an integer >= 1, got ${value}`)
  }
}
