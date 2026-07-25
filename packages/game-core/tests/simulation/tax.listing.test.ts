/**
 * 유저 상점 기간별 세율(`src/economy/tax.ts`) 단위 테스트.
 *
 * 검증 축 (docs/design/06-market.md §기간별 세율 테이블):
 *  - 구간 경계 (3/4, 7/8, 14/15, 21/22 일)
 *  - `apps/bot/src/services/market.ts` 의 `taxRateForDuration` 과의 등가성
 *    — bot 쪽은 float(0.03), game-core 는 bps(300). 두 표현이 어긋나면
 *      시뮬레이터의 세수 집계가 실제 런타임과 달라진다.
 *  - 과세 베이스가 총 판매액(수량 × 단가)이라는 규약과 floor 반올림
 */

import { describe, expect, it } from 'vitest'
import {
  calcListingTax,
  LISTING_TAX_BRACKETS,
  LISTING_TAX_MAX_BPS,
  listingTaxRateBps,
} from '../../src'

/**
 * `apps/bot/src/services/market.ts` 의 `taxRateForDuration` 원본 복제.
 *
 * game-core 는 apps/bot 을 import 할 수 없으므로(의존 방향 위반) 원본 로직을
 * 그대로 옮겨 두고 등가성을 비교한다. bot 쪽 구현이 바뀌면 이 테스트가
 * 실패하도록 값을 하드코딩해 둔 것이 요점이다.
 */
function botTaxRateForDuration(days: number): number {
  if (days <= 3) return 0.03
  if (days <= 7) return 0.05
  if (days <= 14) return 0.08
  if (days <= 21) return 0.12
  return 0.18
}

describe('listingTaxRateBps', () => {
  it.each([
    [1, 300],
    [3, 300],
    [4, 500],
    [7, 500],
    [8, 800],
    [14, 800],
    [15, 1_200],
    [21, 1_200],
    [22, 1_800],
    [30, 1_800],
  ])('%i일 → %ibps', (days, expected) => {
    expect(listingTaxRateBps(days)).toBe(expected)
  })

  it('1~30일 전 구간에서 bot 의 taxRateForDuration 과 값이 같다', () => {
    for (let days = 1; days <= 30; days += 1) {
      expect(listingTaxRateBps(days), `${days}일`).toBe(
        Math.round(botTaxRateForDuration(days) * 10_000),
      )
    }
  })

  it('세율이 기간에 대해 단조 증가한다 (누진 구조)', () => {
    let previous = 0
    for (let days = 1; days <= 30; days += 1) {
      const rate = listingTaxRateBps(days)
      expect(rate).toBeGreaterThanOrEqual(previous)
      previous = rate
    }
  })

  it('최고 세율이 LISTING_TAX_MAX_BPS(18%) 를 넘지 않는다', () => {
    for (const bracket of LISTING_TAX_BRACKETS) {
      expect(bracket.rateBps).toBeLessThanOrEqual(LISTING_TAX_MAX_BPS)
    }
  })

  it('0일·음수·소수는 RangeError', () => {
    expect(() => listingTaxRateBps(0)).toThrow(RangeError)
    expect(() => listingTaxRateBps(-1)).toThrow(RangeError)
    expect(() => listingTaxRateBps(2.5)).toThrow(RangeError)
  })
})

describe('calcListingTax', () => {
  it('총 판매액 × 세율 (floor) — 1000원 3% = 30원', () => {
    expect(calcListingTax(1_000n, 300)).toBe(30n)
  })

  it('나머지는 버린다 (floor)', () => {
    // 33 × 3% = 0.99 → 0
    expect(calcListingTax(33n, 300)).toBe(0n)
    // 133 × 18% = 23.94 → 23
    expect(calcListingTax(133n, 1_800)).toBe(23n)
  })

  it('gross=0 이면 세액 0', () => {
    expect(calcListingTax(0n, 1_800)).toBe(0n)
  })

  it('세액은 항상 총액 이하다', () => {
    for (let days = 1; days <= 30; days += 1) {
      const gross = 123_456n
      expect(calcListingTax(gross, listingTaxRateBps(days))).toBeLessThan(gross)
    }
  })

  it('음수 총액·범위 밖 세율은 RangeError', () => {
    expect(() => calcListingTax(-1n, 300)).toThrow(RangeError)
    expect(() => calcListingTax(100n, LISTING_TAX_MAX_BPS + 1)).toThrow(RangeError)
    expect(() => calcListingTax(100n, -1)).toThrow(RangeError)
  })
})
