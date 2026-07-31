/**
 * 마켓·주식 표시 계산 검증.
 *
 * 회귀하면 화면에 조용히 틀린 금액이 뜨는 종류의 로직이다:
 *  - `qty × price` 를 Number 로 곱하면 큰 금액에서 정밀도를 잃는다.
 *  - 발행 주수 0 인 행에서 0으로 나누면 페이지가 통째로 죽는다.
 */

import { describe, expect, it } from 'vitest'
import {
  changeFromBasePpm,
  computePosition,
  formatPpm,
  msUntilExpiry,
  totalPrice,
} from '../../src/lib/market-math'

describe('changeFromBasePpm', () => {
  it('상승·하락·보합을 부호로 구분한다', () => {
    expect(changeFromBasePpm(110n, 100n)).toBe(1000) // +10%
    expect(changeFromBasePpm(90n, 100n)).toBe(-1000) // -10%
    expect(changeFromBasePpm(100n, 100n)).toBe(0)
  })

  it('기준가가 0 이하면 0 을 준다', () => {
    expect(changeFromBasePpm(100n, 0n)).toBe(0)
    expect(changeFromBasePpm(100n, -5n)).toBe(0)
  })

  it('큰 금액에서도 정밀도를 잃지 않는다', () => {
    const base = 10_000_000_000_000_000_000n
    expect(changeFromBasePpm(base * 2n, base)).toBe(PPM_100)
  })
})

/** 100% 를 ppm 으로. */
const PPM_100 = 10_000

describe('totalPrice', () => {
  it('단가 × 수량을 계산한다', () => {
    expect(totalPrice(150n, 4)).toBe(600n)
  })

  it('2^53 을 넘는 총액도 정확하다', () => {
    // Number 로 곱했다면 여기서 어긋난다.
    const unit = 1_000_000_000_000_000n
    expect(totalPrice(unit, 1000)).toBe(1_000_000_000_000_000_000n)
  })

  it('음수·비정수 수량을 0 으로 막는다', () => {
    expect(totalPrice(100n, -1)).toBe(0n)
    expect(totalPrice(100n, 1.5)).toBe(0n)
  })
})

describe('msUntilExpiry', () => {
  it('만료 전이면 양수, 후면 음수다', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    expect(msUntilExpiry(new Date('2026-01-01T00:00:10Z'), now)).toBe(10_000)
    expect(msUntilExpiry(new Date('2025-12-31T23:59:50Z'), now)).toBe(-10_000)
  })
})

describe('computePosition', () => {
  it('평가익을 계산한다', () => {
    const result = computePosition({
      shares: 10,
      avgBuyPrice: 100n,
      currentPrice: 150n,
      sharesOutstanding: 100,
    })
    expect(result.costBasis).toBe(1_000n)
    expect(result.marketValue).toBe(1_500n)
    expect(result.unrealizedPl).toBe(500n)
    expect(result.unrealizedPlPpm).toBe(5_000) // +50%
    expect(result.ownershipPpm).toBe(1_000) // 10%
  })

  it('평가손을 음수로 표현한다', () => {
    const result = computePosition({
      shares: 10,
      avgBuyPrice: 200n,
      currentPrice: 150n,
      sharesOutstanding: 100,
    })
    expect(result.unrealizedPl).toBe(-500n)
    expect(result.unrealizedPlPpm).toBe(-2_500) // -25%
  })

  it('본전이면 손익이 0 이다', () => {
    const result = computePosition({
      shares: 5,
      avgBuyPrice: 100n,
      currentPrice: 100n,
      sharesOutstanding: 50,
    })
    expect(result.unrealizedPl).toBe(0n)
    expect(result.unrealizedPlPpm).toBe(0)
  })

  it('발행 주수가 0 이어도 터지지 않는다', () => {
    const result = computePosition({
      shares: 10,
      avgBuyPrice: 100n,
      currentPrice: 100n,
      sharesOutstanding: 0,
    })
    expect(result.ownershipPpm).toBe(0)
  })

  it('보유 수량이 0 이면 전부 0 이다', () => {
    const result = computePosition({
      shares: 0,
      avgBuyPrice: 100n,
      currentPrice: 150n,
      sharesOutstanding: 100,
    })
    expect(result.costBasis).toBe(0n)
    expect(result.marketValue).toBe(0n)
    expect(result.unrealizedPl).toBe(0n)
    expect(result.unrealizedPlPpm).toBe(0)
  })
})

describe('formatPpm', () => {
  it('소수점을 필요한 만큼만 남긴다', () => {
    expect(formatPpm(1234)).toBe('12.34%')
    expect(formatPpm(-500)).toBe('-5%')
    expect(formatPpm(0)).toBe('0%')
    expect(formatPpm(10_000)).toBe('100%')
  })

  it('유한하지 않은 값을 0% 로 막는다', () => {
    expect(formatPpm(Number.NaN)).toBe('0%')
    expect(formatPpm(Number.POSITIVE_INFINITY)).toBe('0%')
  })
})
