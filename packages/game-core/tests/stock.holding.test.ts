/**
 * 보유 지분 모듈(`src/stock/holding.ts`) 단위 테스트.
 *
 * 검증 축 (docs/design/08-stock.md §관련 스키마 `StockHolding.avgBuyPrice`):
 *  - 가중평균 매수단가 재계산 (floor 1회 나눗셈)
 *  - 신규 매수(prevShares=0) 시 체결 단가 그대로
 *  - BigInt 대량 값 정밀도
 *  - 음수/비정수/0 입력 RangeError
 */

import { describe, expect, it } from 'vitest'
import { computeNextAvgBuyPrice } from '../src'

describe('computeNextAvgBuyPrice', () => {
  it('신규 매수(prevShares=0)면 체결 단가 그대로다', () => {
    expect(
      computeNextAvgBuyPrice({
        prevShares: 0,
        prevAvgBuyPrice: 0n,
        buyShares: 10,
        buyUnitPrice: 1_234n,
      }),
    ).toBe(1_234n)
  })

  it('가중평균: 10주@100 + 10주@200 → 150', () => {
    expect(
      computeNextAvgBuyPrice({
        prevShares: 10,
        prevAvgBuyPrice: 100n,
        buyShares: 10,
        buyUnitPrice: 200n,
      }),
    ).toBe(150n)
  })

  it('주수 가중이 반영된다: 30주@100 + 10주@200 → 125', () => {
    expect(
      computeNextAvgBuyPrice({
        prevShares: 30,
        prevAvgBuyPrice: 100n,
        buyShares: 10,
        buyUnitPrice: 200n,
      }),
    ).toBe(125n)
  })

  it('나눗셈은 마지막 1회 floor 다: 1주@100 + 2주@200 → 166', () => {
    // (100 + 400) / 3 = 166.66… → 166
    expect(
      computeNextAvgBuyPrice({
        prevShares: 1,
        prevAvgBuyPrice: 100n,
        buyShares: 2,
        buyUnitPrice: 200n,
      }),
    ).toBe(166n)
  })

  it('같은 단가로 추가 매수하면 평단가가 변하지 않는다', () => {
    expect(
      computeNextAvgBuyPrice({
        prevShares: 7,
        prevAvgBuyPrice: 555n,
        buyShares: 3,
        buyUnitPrice: 555n,
      }),
    ).toBe(555n)
  })

  it('BigInt 대량 값에서도 정밀도가 유지된다', () => {
    expect(
      computeNextAvgBuyPrice({
        prevShares: 100,
        prevAvgBuyPrice: 1_000_000_000_000n,
        buyShares: 100,
        buyUnitPrice: 2_000_000_000_000n,
      }),
    ).toBe(1_500_000_000_000n)
  })

  it('잘못된 입력은 RangeError', () => {
    const valid = {
      prevShares: 10,
      prevAvgBuyPrice: 100n,
      buyShares: 10,
      buyUnitPrice: 200n,
    }
    expect(() => computeNextAvgBuyPrice({ ...valid, prevShares: -1 })).toThrow(RangeError)
    expect(() => computeNextAvgBuyPrice({ ...valid, prevShares: 1.5 })).toThrow(RangeError)
    expect(() => computeNextAvgBuyPrice({ ...valid, prevAvgBuyPrice: -1n })).toThrow(RangeError)
    expect(() => computeNextAvgBuyPrice({ ...valid, buyShares: 0 })).toThrow(RangeError)
    expect(() => computeNextAvgBuyPrice({ ...valid, buyShares: 2.5 })).toThrow(RangeError)
    expect(() => computeNextAvgBuyPrice({ ...valid, buyUnitPrice: 0n })).toThrow(RangeError)
  })
})
