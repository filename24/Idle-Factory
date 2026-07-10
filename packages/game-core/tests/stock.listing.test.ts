/**
 * 상장 자격 판정 모듈(`src/stock/listing.ts`) 단위 테스트.
 *
 * 검증 축 (docs/design/08-stock.md §상장 조건):
 *  - 4조건 AND — 전 조건 충족 시 빈 배열
 *  - 경계값(Lv.25 · 공장 5 · 1억 · 30일 10회)은 "이상" 이므로 통과
 *  - 개별 조건 미달 코드 + 반환 순서 고정
 *  - 음수/비정수 입력 RangeError
 */

import { describe, expect, it } from 'vitest'
import {
  checkListingConditions,
  LISTING_MIN_FACTORY_COUNT,
  LISTING_MIN_LEVEL,
  LISTING_MIN_RECENT_30D_TRADES,
  LISTING_MIN_TOTAL_ASSETS,
} from '../src'

/** 전 조건 충족 입력 (경계값 정확히). */
const eligible = {
  level: LISTING_MIN_LEVEL,
  factoryCount: LISTING_MIN_FACTORY_COUNT,
  totalAssets: LISTING_MIN_TOTAL_ASSETS,
  recent30dTrades: LISTING_MIN_RECENT_30D_TRADES,
}

describe('checkListingConditions', () => {
  it('상수는 설계 문서 표와 일치한다 (Lv.25 · 5개 · 1억 · 10회)', () => {
    expect(LISTING_MIN_LEVEL).toBe(25)
    expect(LISTING_MIN_FACTORY_COUNT).toBe(5)
    expect(LISTING_MIN_TOTAL_ASSETS).toBe(100_000_000n)
    expect(LISTING_MIN_RECENT_30D_TRADES).toBe(10)
  })

  it('전 조건 충족(경계값 포함)이면 빈 배열 — "이상" 판정', () => {
    expect(checkListingConditions(eligible)).toEqual([])
    expect(
      checkListingConditions({
        level: 99,
        factoryCount: 20,
        totalAssets: 999_999_999_999n,
        recent30dTrades: 500,
      }),
    ).toEqual([])
  })

  it('레벨 미달만 있으면 [LEVEL]', () => {
    expect(checkListingConditions({ ...eligible, level: 24 })).toEqual(['LEVEL'])
  })

  it('공장 수 미달만 있으면 [FACTORY_COUNT]', () => {
    expect(checkListingConditions({ ...eligible, factoryCount: 4 })).toEqual(['FACTORY_COUNT'])
  })

  it('총자산 미달만 있으면 [TOTAL_ASSETS]', () => {
    expect(checkListingConditions({ ...eligible, totalAssets: 99_999_999n })).toEqual([
      'TOTAL_ASSETS',
    ])
  })

  it('최근 30일 거래 미달만 있으면 [RECENT_30D_TRADES]', () => {
    expect(checkListingConditions({ ...eligible, recent30dTrades: 9 })).toEqual([
      'RECENT_30D_TRADES',
    ])
  })

  it('복수 미달은 설계 문서 표 순서로 전부 반환한다', () => {
    expect(
      checkListingConditions({
        level: 1,
        factoryCount: 0,
        totalAssets: 0n,
        recent30dTrades: 0,
      }),
    ).toEqual(['LEVEL', 'FACTORY_COUNT', 'TOTAL_ASSETS', 'RECENT_30D_TRADES'])
  })

  it('음수/비정수 입력은 RangeError', () => {
    expect(() => checkListingConditions({ ...eligible, level: -1 })).toThrow(RangeError)
    expect(() => checkListingConditions({ ...eligible, level: 25.5 })).toThrow(RangeError)
    expect(() => checkListingConditions({ ...eligible, factoryCount: -1 })).toThrow(RangeError)
    expect(() => checkListingConditions({ ...eligible, totalAssets: -1n })).toThrow(RangeError)
    expect(() => checkListingConditions({ ...eligible, recent30dTrades: -1 })).toThrow(RangeError)
    expect(() => checkListingConditions({ ...eligible, recent30dTrades: 1.5 })).toThrow(RangeError)
  })
})
