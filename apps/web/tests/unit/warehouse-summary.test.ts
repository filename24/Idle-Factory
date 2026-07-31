import { describe, test, expect } from 'vitest'
import { MATERIAL_TYPES, capacityOf } from '@idle/game-core'
import ko from '../../messages/ko.json'
import en from '../../messages/en.json'
import { computeWarehouseSummary } from '../../src/lib/warehouse-summary'
import type { WarehouseStackRow } from '../../src/lib/warehouse-summary'

const stack = (material: WarehouseStackRow['material'], count: bigint): WarehouseStackRow => ({
  material,
  count,
})

describe('computeWarehouseSummary', () => {
  test('빈 창고: 용량은 game-core 값, 사용률 0%', () => {
    const summary = computeWarehouseSummary(1, [])

    expect(summary).not.toBeNull()
    expect(summary!.capacity).toBe(capacityOf(1).toString())
    expect(summary!.capacity).toBe('3000')
    expect(summary!.used).toBe('0')
    expect(summary!.free).toBe('3000')
    expect(summary!.usedPercent).toBe(0)
    expect(summary!.stacks).toEqual([])
  })

  test('사용량은 개수 합이 아니라 부피 계수를 곱한 슬롯 합이다', () => {
    // 광석 1개 = 2슬롯, 원유 1개 = 5슬롯 → 100×2 + 10×5 = 250 슬롯.
    const summary = computeWarehouseSummary(1, [stack('ORE', 100n), stack('CRUDE_OIL', 10n)])

    expect(summary!.used).toBe('250')
    expect(summary!.free).toBe('2750')
    expect(summary!.usedPercent).toBe(8)
  })

  test('BigInt 필드는 전부 문자열로 직렬화된다', () => {
    const summary = computeWarehouseSummary(1, [stack('GRAIN', 42n)])

    expect(typeof summary!.capacity).toBe('string')
    expect(typeof summary!.used).toBe('string')
    expect(typeof summary!.free).toBe('string')
    expect(typeof summary!.stacks[0]!.count).toBe('string')
    expect(summary!.stacks[0]!.count).toBe('42')
  })

  test('잔량 0 인 행은 목록에서 제외한다', () => {
    const summary = computeWarehouseSummary(1, [stack('GRAIN', 0n), stack('ORE', 1n)])

    expect(summary!.stacks.map((s) => s.material)).toEqual(['ORE'])
  })

  test('자재 선언 순서로 정렬한다', () => {
    const summary = computeWarehouseSummary(1, [
      stack('RAW_BOOSTER', 1n),
      stack('CAR', 1n),
      stack('GRAIN', 1n),
      stack('STEEL', 1n),
    ])

    expect(summary!.stacks.map((s) => s.material)).toEqual(['GRAIN', 'STEEL', 'CAR', 'RAW_BOOSTER'])
  })

  test('용량 초과 시 여유는 0, 사용률은 100 으로 clamp', () => {
    const summary = computeWarehouseSummary(1, [stack('GRAIN', 5_000n)])

    expect(summary!.free).toBe('0')
    expect(summary!.usedPercent).toBe(100)
  })

  test('등급이 1..10 을 벗어나면 RangeError 대신 null 을 반환한다', () => {
    expect(computeWarehouseSummary(0, [])).toBeNull()
    expect(computeWarehouseSummary(11, [])).toBeNull()
  })

  test('최대 등급 10 도 처리한다', () => {
    const summary = computeWarehouseSummary(10, [])

    expect(summary!.capacity).toBe(capacityOf(10).toString())
  })
})

// 창고 표는 `material.<TYPE>` 키로 자재명을 찍는다. 새 자재를 추가하고
// 카탈로그를 갱신하지 않으면 next-intl 기본 폴백 때문에 화면에
// `material.TEXTILE` 같은 키 문자열이 그대로 노출된다.
describe('material 네임스페이스 커버리지', () => {
  test.each([
    ['ko', ko],
    ['en', en],
  ])('%s 카탈로그가 모든 MaterialType 을 정확히 덮는다', (_locale, catalog) => {
    const keys = Object.keys((catalog as { material: Record<string, string> }).material)
    expect(keys.sort()).toEqual([...MATERIAL_TYPES].sort())
  })
})
