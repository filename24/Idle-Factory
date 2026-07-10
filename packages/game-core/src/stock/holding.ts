/**
 * 주식 보유 지분 — 순수 계산 모듈.
 *
 * 매수 시 가중평균 매수단가(`StockHolding.avgBuyPrice`) 재계산을 결정론적
 * 함수로 제공한다. 매도는 평단가를 바꾸지 않으며, 보유 주수가 0 이 되면
 * 호출자(bot 서비스)가 0 으로 리셋한다 — 이 모듈은 매수 경로만 다룬다.
 *
 * 근거: docs/design/08-stock.md §관련 스키마 `StockHolding`(`shares`,
 * `avgBuyPrice`). BigInt 정수 산술, 나눗셈은 마지막 1회 floor
 * (market/price.ts 관례).
 */

/** `computeNextAvgBuyPrice` 입력. */
export interface ComputeNextAvgBuyPriceInput {
  /** 매수 전 보유 주수 (`StockHolding.shares`, >= 0 정수). */
  readonly prevShares: number
  /**
   * 매수 전 가중평균 매수단가 (`StockHolding.avgBuyPrice`, >= 0).
   * `prevShares = 0` 이면 0 이어야 정합(보유 청산 시 0 리셋 규약).
   */
  readonly prevAvgBuyPrice: bigint
  /** 이번 매수 주수 (>= 1 정수). */
  readonly buyShares: number
  /** 이번 매수 체결 단가 (`Stock.currentPrice`, >= 1). */
  readonly buyUnitPrice: bigint
}

/**
 * 매수 후 가중평균 매수단가를 계산한다.
 *
 * `newAvg = floor((prevShares × prevAvg + buyShares × unitPrice)
 *                 / (prevShares + buyShares))`
 * (docs/design/08-stock.md §관련 스키마 `avgBuyPrice` — 매수 시 재계산).
 *
 * 구현 규약:
 *  - 전 항 BigInt 정수 산술, 나눗셈(floor)은 마지막 1회만 수행한다.
 *  - `prevShares = 0`(신규 매수)이면 결과는 정확히 `buyUnitPrice` 다.
 *  - 매도는 평단가를 바꾸지 않는다. 전량 매도(shares=0)의 0 리셋은
 *    호출자 책임 — 이 함수는 매수 경로 전용.
 *
 * @param input 매수 전 보유 상태 + 이번 매수 내역
 * @returns 매수 후 가중평균 매수단가 (bigint, >= 1)
 * @throws {RangeError} 음수/비정수 주수, prevAvgBuyPrice < 0,
 *   buyShares < 1, buyUnitPrice < 1 인 경우
 */
export function computeNextAvgBuyPrice(input: ComputeNextAvgBuyPriceInput): bigint {
  const { prevShares, prevAvgBuyPrice, buyShares, buyUnitPrice } = input

  if (!Number.isInteger(prevShares) || prevShares < 0) {
    throw new RangeError(`prevShares must be an integer >= 0, got ${prevShares}`)
  }
  if (prevAvgBuyPrice < 0n) {
    throw new RangeError(`prevAvgBuyPrice must be >= 0, got ${prevAvgBuyPrice}`)
  }
  if (!Number.isInteger(buyShares) || buyShares < 1) {
    throw new RangeError(`buyShares must be an integer >= 1, got ${buyShares}`)
  }
  if (buyUnitPrice < 1n) {
    throw new RangeError(`buyUnitPrice must be >= 1, got ${buyUnitPrice}`)
  }

  const totalCost = BigInt(prevShares) * prevAvgBuyPrice + BigInt(buyShares) * buyUnitPrice
  return totalCost / BigInt(prevShares + buyShares)
}
