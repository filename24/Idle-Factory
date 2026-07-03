/**
 * 글로벌 마켓 가격 모듈(`src/market/price.ts`) 단위 테스트.
 *
 * 검증 축 (docs/design/06-market.md §가격 산출 공식):
 *  - clamp 상·하한 경계 (기준가 70% ~ 200%)
 *  - avgSales=0 0-나눗셈 가드 (#15 U-5)
 *  - noise 극단값(범위 밖 포함) 처리
 *  - BigInt floor 반올림 일관성 (마지막 1회 나눗셈)
 *  - 거래량 EMA (0.9/0.1 가중)
 *  - 유저 상점 ±50% 등록가 밴드
 */

import { describe, expect, it } from 'vitest'
import {
  AVG_SALES_EMA_KEEP_WEIGHT,
  AVG_SALES_EMA_SAMPLE_WEIGHT,
  computeDemandFactorPpm,
  computeNextAvgSales,
  computeNextPrice,
  DEFAULT_DEMAND_COEFFICIENT,
  listingPriceBand,
  PRICE_NOISE_LIMIT,
} from '../src'

describe('computeDemandFactorPpm', () => {
  it('avgSales=0 이면 0 을 반환한다 (U-5 0-나눗셈 가드)', () => {
    expect(computeDemandFactorPpm(1_000, 0)).toBe(0n)
  })

  it('recentSales=avgSales 이면 0 (수요 변화 없음)', () => {
    expect(computeDemandFactorPpm(100, 100)).toBe(0n)
  })

  it('거래량 2배면 k=0.1 기준 +10% (1000n)', () => {
    expect(computeDemandFactorPpm(200, 100)).toBe(1_000n)
  })

  it('거래량 0 이면 k=0.1 기준 -10% (-1000n)', () => {
    expect(computeDemandFactorPpm(0, 100)).toBe(-1_000n)
  })

  it('k 를 바꾸면 비례해서 반영된다', () => {
    expect(computeDemandFactorPpm(200, 100, 0.5)).toBe(5_000n)
  })

  it('음수/비정수 입력은 RangeError', () => {
    expect(() => computeDemandFactorPpm(-1, 100)).toThrow(RangeError)
    expect(() => computeDemandFactorPpm(1.5, 100)).toThrow(RangeError)
    expect(() => computeDemandFactorPpm(1, -1)).toThrow(RangeError)
    expect(() => computeDemandFactorPpm(1, Number.NaN)).toThrow(RangeError)
    expect(() => computeDemandFactorPpm(1, 100, -0.1)).toThrow(RangeError)
  })
})

describe('computeNextPrice', () => {
  it('noise=0 · 수요 변화 없음이면 기준가 유지', () => {
    expect(
      computeNextPrice({
        basePrice: 100n,
        recentSales: 100,
        avgSales: 100,
        noise: 0,
      }),
    ).toBe(100n)
  })

  it('avgSales=0 이면 noise 만 반영된다 (U-5 가드)', () => {
    expect(
      computeNextPrice({
        basePrice: 100n,
        recentSales: 9_999,
        avgSales: 0,
        noise: 0.1,
      }),
    ).toBe(110n)
  })

  it('noise 상한 +20% 정확 반영', () => {
    expect(
      computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: 0, noise: PRICE_NOISE_LIMIT }),
    ).toBe(120n)
  })

  it('noise 하한 -20% 정확 반영', () => {
    expect(
      computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: 0, noise: -PRICE_NOISE_LIMIT }),
    ).toBe(80n)
  })

  it('범위 밖 noise 는 ±20% 로 클램프된다 (방어적 처리)', () => {
    expect(computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: 0, noise: 5 })).toBe(120n)
    expect(computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: 0, noise: -5 })).toBe(80n)
  })

  it('수요 급증은 상한(기준가 ×2)에서 clamp 된다', () => {
    expect(
      computeNextPrice({
        basePrice: 100n,
        recentSales: 10_000,
        avgSales: 100,
        noise: PRICE_NOISE_LIMIT,
      }),
    ).toBe(200n)
  })

  it('수요 급감은 하한(기준가 ×0.7)에서 clamp 된다', () => {
    // (1-0.2)×(1-1×1.0) = 0 → 하한 700 으로 클램프 (k=1 주입).
    expect(
      computeNextPrice({
        basePrice: 1_000n,
        recentSales: 0,
        avgSales: 100,
        noise: -PRICE_NOISE_LIMIT,
        demandCoefficient: 1,
      }),
    ).toBe(700n)
  })

  it('노이즈·수요 결합은 곱연산이다 (1+noise)×(1+demand)', () => {
    // 100 × 1.1 × 1.1 = 121
    expect(
      computeNextPrice({
        basePrice: 100n,
        recentSales: 200,
        avgSales: 100,
        noise: 0.1,
      }),
    ).toBe(121n)
  })

  it('BigInt floor 반올림: 나눗셈은 마지막 1회만 수행된다', () => {
    // 999 × 11500 × 10000 / 1e8 = 1148.85 → floor 1148
    expect(computeNextPrice({ basePrice: 999n, recentSales: 0, avgSales: 0, noise: 0.15 })).toBe(
      1_148n,
    )
    // 같은 입력은 항상 같은 출력 (결정성)
    expect(computeNextPrice({ basePrice: 999n, recentSales: 0, avgSales: 0, noise: 0.15 })).toBe(
      1_148n,
    )
  })

  it('극소 기준가(1)에서도 가격이 0 으로 떨어지지 않는다', () => {
    expect(
      computeNextPrice({
        basePrice: 1n,
        recentSales: 0,
        avgSales: 100,
        noise: -PRICE_NOISE_LIMIT,
        demandCoefficient: 1,
      }),
    ).toBe(1n)
  })

  it('k 기본값은 0.1 이다', () => {
    expect(DEFAULT_DEMAND_COEFFICIENT).toBe(0.1)
    const withDefault = computeNextPrice({
      basePrice: 100n,
      recentSales: 200,
      avgSales: 100,
      noise: 0,
    })
    const withExplicit = computeNextPrice({
      basePrice: 100n,
      recentSales: 200,
      avgSales: 100,
      noise: 0,
      demandCoefficient: DEFAULT_DEMAND_COEFFICIENT,
    })
    expect(withDefault).toBe(withExplicit)
    expect(withDefault).toBe(110n)
  })

  it('잘못된 입력은 RangeError', () => {
    expect(() =>
      computeNextPrice({ basePrice: 0n, recentSales: 0, avgSales: 0, noise: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      computeNextPrice({ basePrice: 100n, recentSales: -1, avgSales: 0, noise: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: -1, noise: 0 }),
    ).toThrow(RangeError)
    expect(() =>
      computeNextPrice({ basePrice: 100n, recentSales: 0, avgSales: 0, noise: Number.NaN }),
    ).toThrow(RangeError)
  })
})

describe('computeNextAvgSales', () => {
  it('가중치 상수는 0.9 / 0.1 이다', () => {
    expect(AVG_SALES_EMA_KEEP_WEIGHT).toBe(0.9)
    expect(AVG_SALES_EMA_SAMPLE_WEIGHT).toBe(0.1)
  })

  it('ema = ema×0.9 + recent×0.1', () => {
    expect(computeNextAvgSales(0, 100)).toBeCloseTo(10, 10)
    expect(computeNextAvgSales(10, 0)).toBeCloseTo(9, 10)
    expect(computeNextAvgSales(100, 100)).toBeCloseTo(100, 10)
  })

  it('거래가 없으면 EMA 가 0 으로 수렴한다', () => {
    let ema = 100
    for (let i = 0; i < 200; i++) ema = computeNextAvgSales(ema, 0)
    expect(ema).toBeLessThan(1e-6)
  })

  it('음수/비정수 입력은 RangeError', () => {
    expect(() => computeNextAvgSales(-1, 0)).toThrow(RangeError)
    expect(() => computeNextAvgSales(0, -1)).toThrow(RangeError)
    expect(() => computeNextAvgSales(0, 1.5)).toThrow(RangeError)
    expect(() => computeNextAvgSales(Number.POSITIVE_INFINITY, 0)).toThrow(RangeError)
  })
})

describe('listingPriceBand', () => {
  it('±50% 밴드를 floor 로 계산한다', () => {
    expect(listingPriceBand(10n)).toEqual({ min: 5n, max: 15n })
    expect(listingPriceBand(15n)).toEqual({ min: 7n, max: 22n })
  })

  it('하한은 최저 1 로 보정된다', () => {
    expect(listingPriceBand(1n)).toEqual({ min: 1n, max: 1n })
    expect(listingPriceBand(3n)).toEqual({ min: 1n, max: 4n })
  })

  it('currentPrice < 1 은 RangeError', () => {
    expect(() => listingPriceBand(0n)).toThrow(RangeError)
  })
})
