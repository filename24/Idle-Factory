/**
 * 주식 가격 모듈(`src/stock/price.ts`) 단위 테스트.
 *
 * 검증 축 (docs/design/08-stock.md §주가 결정, §배당 시스템):
 *  - IPO 기본 공식 + 극소 자산 최저 1 보정
 *  - IPO 유저 설정가 30~70% 클램프 경계
 *  - tick 산식 demandPressure(×0.1)·profitDelta(×0.3) 결합
 *  - U-5 0-나눗셈 가드 (totalVolume=0 / avg7dProfit=0)
 *  - 서킷브레이커 ±30% — 기준가는 dayOpenPrice (D10)
 *  - 주당 배당금 (주간 수익 × 10% / 발행 주수, floor 1회)
 */

import { describe, expect, it } from 'vitest'
import {
  clampIpoPrice,
  computeDefaultIpoPrice,
  computeDividendPerShare,
  computeNextStockPrice,
  DAILY_CIRCUIT_BREAKER_PPM,
  DEFAULT_DIVIDEND_RATE_PPM,
  DEFAULT_SHARES_OUTSTANDING,
  IPO_PRICE_CEIL_PPM,
  IPO_PRICE_FLOOR_PPM,
  PROFIT_DELTA_WEIGHT_PPM,
  STOCK_DEMAND_COEFFICIENT_PPM,
} from '../src'

describe('computeDefaultIpoPrice', () => {
  it('기본 공식: (totalAssets + recent30dProfit×10) / 100', () => {
    expect(computeDefaultIpoPrice({ totalAssets: 100_000_000n, recent30dProfit: 0n })).toBe(
      1_000_000n,
    )
  })

  it('recent30dProfit 은 ×10 가중된다', () => {
    expect(computeDefaultIpoPrice({ totalAssets: 0n, recent30dProfit: 100n })).toBe(10n)
  })

  it('발행 주식 수 기본값은 100 이다', () => {
    expect(DEFAULT_SHARES_OUTSTANDING).toBe(100)
    expect(
      computeDefaultIpoPrice({
        totalAssets: 100_000_000n,
        recent30dProfit: 0n,
        sharesOutstanding: DEFAULT_SHARES_OUTSTANDING,
      }),
    ).toBe(computeDefaultIpoPrice({ totalAssets: 100_000_000n, recent30dProfit: 0n }))
  })

  it('sharesOutstanding 주입 시 그대로 나눈다', () => {
    expect(
      computeDefaultIpoPrice({ totalAssets: 1_000n, recent30dProfit: 0n, sharesOutstanding: 10 }),
    ).toBe(100n)
  })

  it('나눗셈은 floor 다', () => {
    expect(computeDefaultIpoPrice({ totalAssets: 199n, recent30dProfit: 0n })).toBe(1n)
  })

  it('극소 자산에서도 최저 1 로 보정된다 (가격 0 방지)', () => {
    expect(computeDefaultIpoPrice({ totalAssets: 0n, recent30dProfit: 0n })).toBe(1n)
  })

  it('잘못된 입력은 RangeError', () => {
    expect(() => computeDefaultIpoPrice({ totalAssets: -1n, recent30dProfit: 0n })).toThrow(
      RangeError,
    )
    expect(() => computeDefaultIpoPrice({ totalAssets: 0n, recent30dProfit: -1n })).toThrow(
      RangeError,
    )
    expect(() =>
      computeDefaultIpoPrice({ totalAssets: 0n, recent30dProfit: 0n, sharesOutstanding: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      computeDefaultIpoPrice({ totalAssets: 0n, recent30dProfit: 0n, sharesOutstanding: 1.5 }),
    ).toThrow(RangeError)
  })
})

describe('clampIpoPrice', () => {
  it('클램프 상수는 30% / 70% 다', () => {
    expect(IPO_PRICE_FLOOR_PPM).toBe(3_000n)
    expect(IPO_PRICE_CEIL_PPM).toBe(7_000n)
  })

  it('범위 내 값은 그대로 통과한다', () => {
    expect(clampIpoPrice(500_000n, 1_000_000n)).toBe(500_000n)
  })

  it('하한(기본가 30%) 미만은 하한으로 클램프', () => {
    expect(clampIpoPrice(1n, 1_000_000n)).toBe(300_000n)
    expect(clampIpoPrice(299_999n, 1_000_000n)).toBe(300_000n)
  })

  it('상한(기본가 70%) 초과는 상한으로 클램프', () => {
    expect(clampIpoPrice(999_999_999n, 1_000_000n)).toBe(700_000n)
    expect(clampIpoPrice(700_001n, 1_000_000n)).toBe(700_000n)
  })

  it('경계값(정확히 30% / 70%)은 그대로 유지된다', () => {
    expect(clampIpoPrice(300_000n, 1_000_000n)).toBe(300_000n)
    expect(clampIpoPrice(700_000n, 1_000_000n)).toBe(700_000n)
  })

  it('상·하한은 floor 나눗셈으로 계산된다', () => {
    // 999 × 0.3 = 299.7 → 299, 999 × 0.7 = 699.3 → 699
    expect(clampIpoPrice(1n, 999n)).toBe(299n)
    expect(clampIpoPrice(999n, 999n)).toBe(699n)
  })

  it('극소 기본가(1)에서도 가격이 0 으로 떨어지지 않는다', () => {
    expect(clampIpoPrice(1n, 1n)).toBe(1n)
    expect(clampIpoPrice(100n, 1n)).toBe(1n)
  })

  it('userSetPrice/defaultIpoPrice < 1 은 RangeError', () => {
    expect(() => clampIpoPrice(0n, 1_000_000n)).toThrow(RangeError)
    expect(() => clampIpoPrice(500_000n, 0n)).toThrow(RangeError)
  })
})

describe('computeNextStockPrice', () => {
  const base = {
    prevPrice: 10_000n,
    buyVolume: 0n,
    sellVolume: 0n,
    last24hProfit: 0n,
    avg7dProfit: 0n,
    dayOpenPrice: 10_000n,
  }

  it('수급·수익 변화가 없으면 직전가 유지', () => {
    expect(computeNextStockPrice(base)).toBe(10_000n)
  })

  it('totalVolume=0 이면 demandPressure=0 (U-5 0-나눗셈 가드)', () => {
    // 수익 변화도 없음(last24h=avg7d) → 가격 불변이어야 한다.
    expect(computeNextStockPrice({ ...base, last24hProfit: 100n, avg7dProfit: 100n })).toBe(10_000n)
  })

  it('avg7dProfit=0 이면 profitDelta=0 (U-5 0-나눗셈 가드)', () => {
    // last24hProfit 이 아무리 커도 수요 압력(+10%)만 반영된다.
    expect(
      computeNextStockPrice({
        ...base,
        buyVolume: 200n,
        last24hProfit: 999_999_999n,
        avg7dProfit: 0n,
      }),
    ).toBe(11_000n)
  })

  it('demandPressure = (buy-sell)/total × 0.1', () => {
    expect(STOCK_DEMAND_COEFFICIENT_PPM).toBe(1_000n)
    // (200-100)/300 × 0.1 = +3.33% (ppm 333, 0 방향 절사)
    expect(computeNextStockPrice({ ...base, buyVolume: 200n, sellVolume: 100n })).toBe(10_333n)
    // 전량 매도: (0-100)/100 × 0.1 = -10%
    expect(computeNextStockPrice({ ...base, sellVolume: 100n })).toBe(9_000n)
  })

  it('profitDelta 는 가중치 0.3 으로 반영된다', () => {
    expect(PROFIT_DELTA_WEIGHT_PPM).toBe(3_000n)
    // (200-100)/100 × 0.3 = +30%
    expect(computeNextStockPrice({ ...base, last24hProfit: 200n, avg7dProfit: 100n })).toBe(13_000n)
    // (0-100)/100 × 0.3 = -30%
    expect(computeNextStockPrice({ ...base, last24hProfit: 0n, avg7dProfit: 100n })).toBe(7_000n)
  })

  it('서킷브레이커: 상승은 dayOpenPrice +30% 에서 clamp (D10)', () => {
    expect(DAILY_CIRCUIT_BREAKER_PPM).toBe(3_000n)
    // demand +10% + profit +30% = raw 14_000 → ceil 13_000
    expect(
      computeNextStockPrice({
        ...base,
        buyVolume: 200n,
        last24hProfit: 200n,
        avg7dProfit: 100n,
      }),
    ).toBe(13_000n)
  })

  it('서킷브레이커 기준가는 prevPrice 가 아니라 dayOpenPrice 다 (D10)', () => {
    // 당일 이미 +30% 도달: prev 13_000, dayOpen 10_000 → 수요 +10% 라도 13_000 유지
    expect(computeNextStockPrice({ ...base, prevPrice: 13_000n, buyVolume: 200n })).toBe(13_000n)
    // 당일 이미 -30% 도달: prev 7_000, dayOpen 10_000 → 매도 압력에도 7_000 유지
    expect(computeNextStockPrice({ ...base, prevPrice: 7_000n, sellVolume: 100n })).toBe(7_000n)
  })

  it('하락 클램프 경계: 정확히 -30% 는 통과한다', () => {
    expect(computeNextStockPrice({ ...base, last24hProfit: 0n, avg7dProfit: 100n })).toBe(7_000n)
  })

  it('BigInt floor: 나눗셈은 항마다 마지막 1회만 수행된다', () => {
    // 999 × 11000 / 10000 = 1098.9 → floor 1098 (ceil 은 999×1.3=1298 로 미도달)
    const input = {
      ...base,
      prevPrice: 999n,
      dayOpenPrice: 999n,
      buyVolume: 100n,
    }
    expect(computeNextStockPrice(input)).toBe(1_098n)
    // 같은 입력은 항상 같은 출력 (결정성)
    expect(computeNextStockPrice(input)).toBe(1_098n)
  })

  it('극소가(1)에서도 가격이 0 으로 떨어지지 않는다', () => {
    expect(
      computeNextStockPrice({ ...base, prevPrice: 1n, dayOpenPrice: 1n, sellVolume: 100n }),
    ).toBe(1n)
  })

  it('계수 주입 시 비례해서 반영된다 (옵션 주입)', () => {
    // k=0.5: (100-0)/100 × 0.5 = +50% → raw 15_000 → ceil 13_000 클램프
    expect(computeNextStockPrice({ ...base, buyVolume: 100n, demandCoefficientPpm: 5_000n })).toBe(
      13_000n,
    )
    // 가중치 0.1: (200-100)/100 × 0.1 = +10%
    expect(
      computeNextStockPrice({
        ...base,
        last24hProfit: 200n,
        avg7dProfit: 100n,
        profitDeltaWeightPpm: 1_000n,
      }),
    ).toBe(11_000n)
  })

  it('잘못된 입력은 RangeError', () => {
    expect(() => computeNextStockPrice({ ...base, prevPrice: 0n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, dayOpenPrice: 0n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, buyVolume: -1n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, sellVolume: -1n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, last24hProfit: -1n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, avg7dProfit: -1n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, demandCoefficientPpm: -1n })).toThrow(RangeError)
    expect(() => computeNextStockPrice({ ...base, profitDeltaWeightPpm: -1n })).toThrow(RangeError)
  })
})

describe('computeDividendPerShare', () => {
  it('기본 배당률은 10% (1000‱) 다', () => {
    expect(DEFAULT_DIVIDEND_RATE_PPM).toBe(1_000)
  })

  it('주당 배당금 = 주간 수익 × 10% / 발행 주수', () => {
    // 1_000_000 × 0.10 / 100 = 1_000
    expect(computeDividendPerShare({ weeklyProfit: 1_000_000n, sharesOutstanding: 100 })).toBe(
      1_000n,
    )
  })

  it('배당률 주입 시 비례해서 반영된다', () => {
    expect(
      computeDividendPerShare({
        weeklyProfit: 1_000_000n,
        sharesOutstanding: 100,
        dividendRatePpm: 2_000,
      }),
    ).toBe(2_000n)
  })

  it('floor 나눗셈은 마지막 1회만 수행된다 (극소 수익 → 0)', () => {
    // 999 × 1000 / (10000 × 100) = 0.999 → 0
    expect(computeDividendPerShare({ weeklyProfit: 999n, sharesOutstanding: 100 })).toBe(0n)
    // 10_099 × 1000 / 1_000_000 = 10.099 → 10 (결정적 floor)
    expect(computeDividendPerShare({ weeklyProfit: 10_099n, sharesOutstanding: 100 })).toBe(10n)
  })

  it('weeklyProfit=0 이면 0 을 반환한다', () => {
    expect(computeDividendPerShare({ weeklyProfit: 0n, sharesOutstanding: 100 })).toBe(0n)
  })

  it('잘못된 입력은 RangeError', () => {
    expect(() => computeDividendPerShare({ weeklyProfit: -1n, sharesOutstanding: 100 })).toThrow(
      RangeError,
    )
    expect(() => computeDividendPerShare({ weeklyProfit: 0n, sharesOutstanding: 0 })).toThrow(
      RangeError,
    )
    expect(() =>
      computeDividendPerShare({ weeklyProfit: 0n, sharesOutstanding: 100, dividendRatePpm: -1 }),
    ).toThrow(RangeError)
    expect(() =>
      computeDividendPerShare({
        weeklyProfit: 0n,
        sharesOutstanding: 100,
        dividendRatePpm: 10_001,
      }),
    ).toThrow(RangeError)
    expect(() =>
      computeDividendPerShare({ weeklyProfit: 0n, sharesOutstanding: 100, dividendRatePpm: 1.5 }),
    ).toThrow(RangeError)
  })
})
