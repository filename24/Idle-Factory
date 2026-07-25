/**
 * 수확 경계 조합 테스트 (#21 최종 QA — 엣지케이스).
 *
 * 단일 축(등급, tick, 부스터)은 `production.test.ts` 가 이미 덮는다. 여기서
 * 검증하는 것은 **모든 상한을 동시에 밀어붙였을 때**도 계산이 무너지지 않는지다:
 *
 *  - 등급 10 (배수 1.5^9 ≈ 38.4배)
 *  - `MAX_TICKS_PER_HARVEST` = 10,000 tick (오프라인 상한)
 *  - 원료 부스터 ×1.2 + 업그레이드 부스터 SPEED ×1.15
 *  - 특수 슬롯 ×1.2 + 인접 시너지 ×1.3
 *  - 부피 계수가 2 이상인 자재 (창고 클램프가 개수와 부피를 섞어 쓰면 깨진다)
 *
 * bigint 가 필요한 이유도 함께 고정한다. 이 조합의 *산출 개수* 자체는 2^53 을
 * 넘지 않지만(등급10·상한 tick 에서 약 2,482만), 배수를 분수로 접는 과정이
 * 매 단계 내림을 하므로 부동소수점으로 같은 결과를 재현할 수 없다. 창고 재고
 * 합산은 실제로 2^53 을 넘길 수 있어 그쪽은 별도로 검증한다.
 */

import { describe, expect, it } from 'vitest'
import { FACTORY_CATALOG } from '../src/factories/catalog'
import {
  computeFactoryYield,
  computeGradeMultiplier,
  MAX_TICKS_PER_HARVEST,
} from '../src/factories/production'
import type { FactoryState, FactoryType } from '../src/types'
import { capacityOf, computeUsed, volumeOf } from '../src/warehouse/capacity'

/** 모든 상한을 켠 공장 상태. */
function maxedFactory(type: FactoryType): FactoryState {
  return {
    type,
    grade: 10,
    lastHarvestAt: new Date(0),
    shortageMode: 'PAUSE',
    upgradeBooster: 'SPEED',
    hasRawBooster: true,
  }
}

/** 사실상 무한한 창고 여유 — 창고 클램프를 배제하고 생산 상한만 본다. */
const UNBOUNDED = 10n ** 30n

describe('등급10 × MAX_TICKS × 부스터 × 시너지 동시 상한', () => {
  const T1_TYPES: readonly FactoryType[] = ['FARM', 'MINE', 'LUMBER', 'OIL_WELL']

  it('T1 4종이 상한 조합에서도 정확한 bigint 산출을 낸다', () => {
    for (const type of T1_TYPES) {
      const result = computeFactoryYield({
        factory: maxedFactory(type),
        availableMaterials: {},
        warehouseFree: UNBOUNDED,
        elapsedTicks: MAX_TICKS_PER_HARVEST,
        slotBonus: 1.2,
        synergyBonus: 1.3,
      })

      expect(result.ticksRealized, type).toBe(MAX_TICKS_PER_HARVEST)

      const entry = FACTORY_CATALOG[type]
      const mult = computeGradeMultiplier(10, true, 'SPEED')
      // 구현과 같은 순서로 접는다: (기본 × tick × 등급배수) → 슬롯 → 시너지.
      const base = entry.baseProduction * BigInt(MAX_TICKS_PER_HARVEST)
      const withGrade = (base * mult.numerator) / mult.denominator
      const withSlot = (withGrade * 120n) / 100n
      const expected = (withSlot * 130n) / 100n

      expect(result.produced[entry.output], type).toBe(expected)
    }
  })

  it('부동소수점 계산과 결과가 갈린다 — 분수 내림이 누적되기 때문', () => {
    const result = computeFactoryYield({
      factory: maxedFactory('FARM'),
      availableMaterials: {},
      warehouseFree: UNBOUNDED,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
      slotBonus: 1.2,
      synergyBonus: 1.3,
    })

    const produced = result.produced.GRAIN!
    // 같은 공식을 float 로 계산하면 내림 시점이 달라 값이 어긋난다.
    const naive = Math.floor(30 * MAX_TICKS_PER_HARVEST * 1.5 ** 9 * 1.2 * 1.15 * 1.2 * 1.3)
    expect(produced).not.toBe(BigInt(naive))
    // 그래도 오차는 상대적으로 작아야 한다 — 공식이 바뀐 게 아니라 내림 차이다.
    const diff = Number(produced) - naive
    expect(Math.abs(diff) / naive).toBeLessThan(0.01)
  })

  it('computeFactoryYield 는 tick 상한을 스스로 걸지 않는다', () => {
    const overLimit = computeFactoryYield({
      factory: maxedFactory('FARM'),
      availableMaterials: {},
      warehouseFree: UNBOUNDED,
      elapsedTicks: MAX_TICKS_PER_HARVEST * 100,
      slotBonus: 1.2,
      synergyBonus: 1.3,
    })
    const atLimit = computeFactoryYield({
      factory: maxedFactory('FARM'),
      availableMaterials: {},
      warehouseFree: UNBOUNDED,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
      slotBonus: 1.2,
      synergyBonus: 1.3,
    })

    // 오프라인 상한 클램프는 `computeElapsedTicks` 의 책임이다. 여기서 초과
    // 입력이 그대로 반영되는 것을 고정해 두면, 호출자가 클램프를 빼먹었을 때
    // 어디서 폭주하는지가 분명해진다.
    expect(overLimit.produced.GRAIN!).toBeGreaterThan(atLimit.produced.GRAIN!)
    expect(overLimit.ticksRealized).toBe(MAX_TICKS_PER_HARVEST * 100)
  })
})

describe('창고 클램프 × 부피 계수 (#21 결정 4)', () => {
  it('부피 계수가 큰 자재는 더 적은 개수에서 창고가 막힌다', () => {
    // 유정(CRUDE_OIL, 계수 5) 등급1: 8개/tick → 40 슬롯/tick.
    const capacity = capacityOf(1)
    const result = computeFactoryYield({
      factory: {
        type: 'OIL_WELL',
        grade: 1,
        lastHarvestAt: new Date(0),
        shortageMode: 'PAUSE',
        upgradeBooster: null,
        hasRawBooster: false,
      },
      availableMaterials: {},
      warehouseFree: capacity,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
    })

    const produced = result.produced.CRUDE_OIL!
    // 3,000 슬롯 ÷ (8개 × 계수 5) = 75 tick → 600 개.
    expect(result.ticksRealized).toBe(75)
    expect(produced).toBe(600n)
    // 개수(600)가 아니라 부피(3,000)가 용량과 맞아야 한다.
    expect(produced * volumeOf('CRUDE_OIL')).toBe(capacity)
    expect(computeUsed(result.produced)).toBe(capacity)
  })

  it('여유가 1 슬롯 부족하면 그 tick 은 생산하지 않는다', () => {
    const result = computeFactoryYield({
      factory: {
        type: 'OIL_WELL',
        grade: 1,
        lastHarvestAt: new Date(0),
        shortageMode: 'PAUSE',
        upgradeBooster: null,
        hasRawBooster: false,
      },
      availableMaterials: {},
      // 1 tick 은 40 슬롯을 요구한다 — 39 면 한 tick 도 못 돈다.
      warehouseFree: 39n,
      elapsedTicks: 10,
    })

    expect(result.ticksRealized).toBe(0)
    expect(result.produced).toEqual({})
  })

  it('등급10 유정도 부피 기준으로 정확히 클램프된다', () => {
    const grade = 10
    const capacity = capacityOf(1)
    const result = computeFactoryYield({
      factory: {
        type: 'OIL_WELL',
        grade,
        lastHarvestAt: new Date(0),
        shortageMode: 'PAUSE',
        upgradeBooster: null,
        hasRawBooster: false,
      },
      availableMaterials: {},
      warehouseFree: capacity,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
    })

    const mult = computeGradeMultiplier(grade, false, null)
    const perTickUnits =
      (FACTORY_CATALOG.OIL_WELL.baseProduction * mult.numerator) / mult.denominator
    const perTickVolume = perTickUnits * volumeOf('CRUDE_OIL')

    expect(result.ticksRealized).toBe(Number(capacity / perTickVolume))
    expect(computeUsed(result.produced)).toBeLessThanOrEqual(capacity)
  })
})

describe('레시피 클램프 × 상한 조합', () => {
  it('원료가 바닥나면 상한 tick 이어도 그만큼만 돈다', () => {
    // 제철소: ORE 3개/tick 소비 (등급1). 등급10 배수가 소비에도 걸리지 않는지
    // 확인 — 소비는 SAVING 부스터만 조정한다.
    const result = computeFactoryYield({
      factory: {
        type: 'STEEL_MILL',
        grade: 1,
        lastHarvestAt: new Date(0),
        shortageMode: 'PAUSE',
        upgradeBooster: null,
        hasRawBooster: false,
      },
      availableMaterials: { ORE: 30n },
      warehouseFree: UNBOUNDED,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
    })

    expect(result.ticksRealized).toBe(10)
    expect(result.consumed.ORE).toBe(30n)
  })

  it('원료가 0 이면 한 tick 도 돌지 않는다', () => {
    const result = computeFactoryYield({
      factory: {
        type: 'CAR_FACTORY',
        grade: 10,
        lastHarvestAt: new Date(0),
        shortageMode: 'PAUSE',
        upgradeBooster: 'SPEED',
        hasRawBooster: true,
      },
      availableMaterials: {},
      warehouseFree: UNBOUNDED,
      elapsedTicks: MAX_TICKS_PER_HARVEST,
    })

    expect(result.ticksRealized).toBe(0)
    expect(result.produced).toEqual({})
    expect(result.consumed).toEqual({})
  })
})

describe('computeUsed 오버플로우 내성', () => {
  it('창고 10등급을 가득 채운 규모에서도 정확히 합산한다', () => {
    const capacity = capacityOf(10) // 59,049,000 슬롯
    // ORE 는 계수 2 — 개수로는 절반만 들어간다.
    const oreUnits = capacity / 2n
    expect(computeUsed({ ORE: oreUnits })).toBe(capacity)
    expect(computeUsed({ ORE: oreUnits, GRAIN: 1n })).toBe(capacity + 1n)
  })

  it('Number 정밀도를 넘는 수량도 정확하다', () => {
    const huge = BigInt(Number.MAX_SAFE_INTEGER) + 1n
    expect(computeUsed({ ORE: huge })).toBe(huge * 2n)
    expect(computeUsed({ CRUDE_OIL: huge })).toBe(huge * 5n)
  })
})
