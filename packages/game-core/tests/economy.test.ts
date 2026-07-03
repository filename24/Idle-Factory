/**
 * 경제 순수 함수 단위 테스트 (#16).
 *
 * 검증 축:
 *  - 직구매: 허용 자재(T1+T2 9종), ×2 단가, 레벨 구간별 일일 한도 경계
 *  - 누진세: 자산 구간 경계([min, max)), 가산세 합산, 40% cap, bps 환산
 *  - 총자산 평가(U-2): 현금 + 창고×시세 + 공장 누적 투자비
 *  - KST 경계: 자정/주 시작 경계, 정확히 일요일 00:00 KST 인 입력
 *
 * 수치 근거: docs/design/04-economy.md, docs/design/07-global-system.md
 */

import { describe, expect, it } from 'vitest'
import {
  baseTaxRateBps,
  buildCost,
  calcWeeklyTax,
  DIRECT_BUY_MATERIALS,
  directBuyDailyLimit,
  directBuyUnitPrice,
  effectiveTaxRateBps,
  evaluateTotalAssets,
  factoryInvestment,
  isDirectBuyMaterial,
  kstDayStart,
  kstNextDayStart,
  kstSettlementWindow,
  kstWeekStart,
  surchargeToBps,
  upgradeMoneyCost,
  type MaterialType,
} from '../src'

describe('economy/directBuy', () => {
  it('허용 자재는 T1 4종 + T2 5종 = 9종', () => {
    expect(DIRECT_BUY_MATERIALS).toHaveLength(9)
    expect(isDirectBuyMaterial('GRAIN')).toBe(true)
    expect(isDirectBuyMaterial('FURNITURE')).toBe(true)
  })

  it.each<MaterialType>(['CAR', 'ELECTRONIC', 'FINISHED_FOOD', 'RAW_BOOSTER'])(
    'T3·RAW_BOOSTER 차단: %s',
    (material) => {
      expect(isDirectBuyMaterial(material)).toBe(false)
    },
  )

  it('레벨 구간별 일일 한도 — 04 문서 테이블 경계 (1~5/6~15/16~30/31+)', () => {
    expect(directBuyDailyLimit(1)).toBe(100)
    expect(directBuyDailyLimit(5)).toBe(100)
    expect(directBuyDailyLimit(6)).toBe(500)
    expect(directBuyDailyLimit(15)).toBe(500)
    expect(directBuyDailyLimit(16)).toBe(2_000)
    expect(directBuyDailyLimit(30)).toBe(2_000)
    expect(directBuyDailyLimit(31)).toBe(10_000)
    expect(directBuyDailyLimit(999)).toBe(10_000)
  })

  it('유효하지 않은 레벨은 RangeError', () => {
    expect(() => directBuyDailyLimit(0)).toThrow(RangeError)
    expect(() => directBuyDailyLimit(1.5)).toThrow(RangeError)
  })

  it('직구매 단가 = 현재가 ×2 (04 §가격 결정)', () => {
    expect(directBuyUnitPrice(1n)).toBe(2n)
    expect(directBuyUnitPrice(150n)).toBe(300n)
    expect(() => directBuyUnitPrice(0n)).toThrow(RangeError)
  })
})

describe('economy/tax', () => {
  it('누진 구간 경계 [min, max) — "1억 이상 20%" 앵커 (07 §세율)', () => {
    expect(baseTaxRateBps(0n)).toBe(500)
    expect(baseTaxRateBps(999_999n)).toBe(500)
    expect(baseTaxRateBps(1_000_000n)).toBe(1_000) // 정확히 100만 → 상위 구간
    expect(baseTaxRateBps(9_999_999n)).toBe(1_000)
    expect(baseTaxRateBps(10_000_000n)).toBe(1_500)
    expect(baseTaxRateBps(99_999_999n)).toBe(1_500)
    expect(baseTaxRateBps(100_000_000n)).toBe(2_000) // 1억 이상 20%
    expect(() => baseTaxRateBps(-1n)).toThrow(RangeError)
  })

  it('surchargeToBps — float 환산 + [0, 2000] 클램프', () => {
    expect(surchargeToBps(0)).toBe(0)
    expect(surchargeToBps(0.05)).toBe(500)
    expect(surchargeToBps(0.1)).toBe(1_000)
    expect(surchargeToBps(0.2)).toBe(2_000)
    // 손상 데이터 방어 — cap 을 뚫지 못한다.
    expect(surchargeToBps(0.5)).toBe(2_000)
    expect(surchargeToBps(-0.1)).toBe(0)
    expect(() => surchargeToBps(Number.NaN)).toThrow(RangeError)
  })

  it('유효 세율 = 누진 + 가산, cap 40% (07 §세율)', () => {
    expect(effectiveTaxRateBps(0n, 0)).toBe(500)
    expect(effectiveTaxRateBps(0n, 1_000)).toBe(1_500)
    // 최고 구간(20%) + 최대 가산(20%p) = 정확히 cap 40%.
    expect(effectiveTaxRateBps(100_000_000n, 2_000)).toBe(4_000)
    // cap 초과 입력(손상 bps)도 40% 에서 잘린다.
    expect(effectiveTaxRateBps(100_000_000n, 3_000)).toBe(4_000)
    expect(() => effectiveTaxRateBps(0n, -1)).toThrow(RangeError)
  })

  it('calcWeeklyTax — 1만분율 정수 산술, floor', () => {
    expect(calcWeeklyTax(10_000n, 500)).toBe(500n) // 5%
    expect(calcWeeklyTax(10_000n, 4_000)).toBe(4_000n) // cap 40%
    expect(calcWeeklyTax(999n, 500)).toBe(49n) // floor(49.95)
    expect(calcWeeklyTax(0n, 2_000)).toBe(0n)
    expect(() => calcWeeklyTax(-1n, 500)).toThrow(RangeError)
    expect(() => calcWeeklyTax(1n, 4_001)).toThrow(RangeError)
  })
})

describe('economy/assets', () => {
  it('factoryInvestment — 신축비 + 누적 업그레이드 비용 (U-2)', () => {
    const base = buildCost('FARM')
    expect(factoryInvestment('FARM', 1)).toBe(base)
    expect(factoryInvestment('FARM', 2)).toBe(base + upgradeMoneyCost('FARM', 1))
    expect(factoryInvestment('FARM', 3)).toBe(
      base + upgradeMoneyCost('FARM', 1) + upgradeMoneyCost('FARM', 2),
    )
    expect(() => factoryInvestment('FARM', 0)).toThrow(RangeError)
    expect(() => factoryInvestment('FARM', 11)).toThrow(RangeError)
  })

  it('evaluateTotalAssets — 현금 + 창고×시세 + 공장 투자비 합산', () => {
    const prices = new Map<MaterialType, bigint>([
      ['GRAIN', 10n],
      ['STEEL', 100n],
    ])
    const total = evaluateTotalAssets({
      money: 1_000n,
      stacks: [
        { material: 'GRAIN', count: 50n }, // 500
        { material: 'STEEL', count: 3n }, // 300
        { material: 'WOOD', count: 99n }, // 시세 없음 → 0 (방어 경로)
      ],
      prices,
      factories: [{ type: 'FARM', grade: 2 }],
    })
    expect(total).toBe(1_000n + 500n + 300n + factoryInvestment('FARM', 2))
  })

  it('음수 입력은 RangeError', () => {
    const prices = new Map<MaterialType, bigint>()
    expect(() => evaluateTotalAssets({ money: -1n, stacks: [], prices, factories: [] })).toThrow(
      RangeError,
    )
    expect(() =>
      evaluateTotalAssets({
        money: 0n,
        stacks: [{ material: 'GRAIN', count: -1n }],
        prices,
        factories: [],
      }),
    ).toThrow(RangeError)
  })
})

describe('economy/kst', () => {
  it('kstDayStart — KST 23:59 와 다음날 00:00 이 다른 일자 키를 갖는다', () => {
    // 2026-07-03 23:59 KST = 2026-07-03T14:59Z
    const lateNight = new Date('2026-07-03T14:59:00Z')
    // 2026-07-04 00:00 KST = 2026-07-03T15:00Z
    const midnight = new Date('2026-07-03T15:00:00Z')
    expect(kstDayStart(lateNight).toISOString()).toBe('2026-07-02T15:00:00.000Z')
    expect(kstDayStart(midnight).toISOString()).toBe('2026-07-03T15:00:00.000Z')
    expect(kstNextDayStart(lateNight).toISOString()).toBe('2026-07-03T15:00:00.000Z')
  })

  it('kstWeekStart — 직전 일요일 00:00 KST (경계 포함)', () => {
    // 2026-07-03 은 금요일. 직전 일요일 = 2026-06-28 00:00 KST = 06-27T15:00Z.
    const friday = new Date('2026-07-03T05:00:00Z')
    expect(kstWeekStart(friday).toISOString()).toBe('2026-06-27T15:00:00.000Z')

    // 정확히 일요일 00:00 KST 인 입력은 그 시각 자체를 반환.
    const sundayMidnightKst = new Date('2026-06-27T15:00:00Z')
    expect(kstWeekStart(sundayMidnightKst).toISOString()).toBe('2026-06-27T15:00:00.000Z')

    // 일요일 00:00 KST 직전(토 23:59 KST)은 그 전 주 일요일로.
    const justBefore = new Date('2026-06-27T14:59:59Z')
    expect(kstWeekStart(justBefore).toISOString()).toBe('2026-06-20T15:00:00.000Z')
  })

  it('kstSettlementWindow — [직전 일요일-7일, 직전 일요일) (U-6)', () => {
    // 정산 잡 시각: 2026-07-04 15:00 UTC = 2026-07-05(일) 00:00 KST.
    const cronFire = new Date('2026-07-04T15:00:00Z')
    const window = kstSettlementWindow(cronFire)
    expect(window.end.toISOString()).toBe('2026-07-04T15:00:00.000Z')
    expect(window.start.toISOString()).toBe('2026-06-27T15:00:00.000Z')
  })
})
