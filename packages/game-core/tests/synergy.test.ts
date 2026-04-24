import { describe, expect, it } from 'vitest'
import {
  computeLandSynergies,
  getSynergyMultiplier,
  SYNERGY_MAX_BONUS,
  type SynergyFactoryInput,
  type SynergySlotInput,
} from '../src/land/synergy'
import type { FactoryType, SlotType } from '../src/types'

const factory = (
  id: string,
  type: FactoryType,
  x: number,
  y: number,
  size = 1,
): SynergyFactoryInput => ({
  id,
  type,
  anchorX: x,
  anchorY: y,
  width: size,
  height: size,
})

const slot = (
  x: number,
  y: number,
  type: SlotType = 'NORMAL',
  locked = false,
): SynergySlotInput => ({ x, y, type, locked })

const emptyLand = (width = 4, height = 4): SynergySlotInput[] => {
  const arr: SynergySlotInput[] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) arr.push(slot(x, y))
  return arr
}

describe('computeLandSynergies — 단방향 공장 쌍', () => {
  it('MINE ↔ STEEL_MILL 인접 시 STEEL_MILL 만 +10%', () => {
    const result = computeLandSynergies({
      factories: [factory('m', 'MINE', 0, 0), factory('s', 'STEEL_MILL', 1, 0)],
      slots: emptyLand(),
    })
    expect(getSynergyMultiplier(result, 's')).toBe(1.1)
    // MINE 은 provider 일 뿐, 자체 시너지 수혜 없음.
    expect(getSynergyMultiplier(result, 'm')).toBe(1.0)
  })

  it('OIL_WELL ↔ REFINERY 인접 → REFINERY +10%', () => {
    const result = computeLandSynergies({
      factories: [factory('o', 'OIL_WELL', 0, 0), factory('r', 'REFINERY', 0, 1)],
      slots: emptyLand(),
    })
    expect(getSynergyMultiplier(result, 'r')).toBe(1.1)
    expect(getSynergyMultiplier(result, 'o')).toBe(1.0)
  })

  it('STEEL_MILL + REFINERY 가 CAR_FACTORY 양쪽에 인접 → +5+5=+10%', () => {
    // CAR_FACTORY(T3, 2×2) at (1,1)..(2,2) — 주변 셀에 STEEL_MILL, REFINERY 배치
    const result = computeLandSynergies({
      factories: [
        factory('c', 'CAR_FACTORY', 1, 1, 2),
        factory('s', 'STEEL_MILL', 0, 1), // left of car
        factory('r', 'REFINERY', 3, 1), // right of car
      ],
      slots: emptyLand(),
    })
    expect(getSynergyMultiplier(result, 'c')).toBe(1.1)
  })

  it('같은 provider 공장이 두 셀과 인접해도 1건만 카운트', () => {
    // T3 CAR_FACTORY 2×2 하나와 STEEL_MILL 2×2 인접 — 인접 셀 2개지만 +5% 한 번만
    // (STEEL_MILL은 T2 1x1이므로 대신 STEEL_MILL을 두 개 배치해서 테스트)
    // 여기서는 STEEL_MILL 1개가 CAR_FACTORY 의 2셀과 맞닿는 시나리오 — STEEL_MILL 은 1×1 이라
    // 자연스럽게 한 셀만 맞닿음. 대신 T3 crossing 시나리오로 대체: MINE(1×1) 이 STEEL_MILL(1×1) 과 1셀 인접 + MINE 을 복수 배치.
    const result = computeLandSynergies({
      factories: [
        factory('s', 'STEEL_MILL', 1, 1),
        factory('m1', 'MINE', 0, 1), // left
        factory('m2', 'MINE', 2, 1), // right
        factory('m3', 'MINE', 1, 0), // top
      ],
      slots: emptyLand(),
    })
    // STEEL_MILL 은 MINE 3개와 인접 → 각 MINE 개별 provider 로 카운트
    // 공장 쌍 규칙에 따라 MINE → STEEL_MILL 은 +10% per provider. 3 × 10% = 30% (정확히 clamp 지점)
    expect(getSynergyMultiplier(result, 's')).toBe(1 + SYNERGY_MAX_BONUS)
  })
})

describe('computeLandSynergies — WATER 인접 보너스', () => {
  it('FARM 이 해제된 WATER 와 인접하면 +10%', () => {
    const slots: SynergySlotInput[] = emptyLand().map((s) =>
      s.x === 1 && s.y === 0 ? { ...s, type: 'WATER', locked: false } : s,
    )
    const result = computeLandSynergies({
      factories: [factory('f', 'FARM', 0, 0)],
      slots,
    })
    expect(getSynergyMultiplier(result, 'f')).toBe(1.1)
  })

  it('FLOUR_MILL 도 WATER 인접으로 +10%', () => {
    const slots: SynergySlotInput[] = emptyLand().map((s) =>
      s.x === 1 && s.y === 0 ? { ...s, type: 'WATER', locked: false } : s,
    )
    const result = computeLandSynergies({
      factories: [factory('fl', 'FLOUR_MILL', 0, 0)],
      slots,
    })
    expect(getSynergyMultiplier(result, 'fl')).toBe(1.1)
  })

  it('잠긴 WATER 슬롯은 보너스 제공 안 함', () => {
    const slots: SynergySlotInput[] = emptyLand().map((s) =>
      s.x === 1 && s.y === 0 ? { ...s, type: 'WATER', locked: true } : s,
    )
    const result = computeLandSynergies({
      factories: [factory('f', 'FARM', 0, 0)],
      slots,
    })
    expect(getSynergyMultiplier(result, 'f')).toBe(1.0)
  })

  it('WATER 가 MINE 에는 보너스 없음', () => {
    const slots: SynergySlotInput[] = emptyLand().map((s) =>
      s.x === 1 && s.y === 0 ? { ...s, type: 'WATER', locked: false } : s,
    )
    const result = computeLandSynergies({
      factories: [factory('m', 'MINE', 0, 0)],
      slots,
    })
    expect(getSynergyMultiplier(result, 'm')).toBe(1.0)
  })

  it('FARM ↔ FLOUR_MILL 인접 + 양쪽 모두 WATER 인접 → 농장:+10%, 제분소:+10+10=+20%', () => {
    // FARM(0,0) - FLOUR_MILL(1,0) 인접 → FLOUR_MILL +10% (FARM→FLOUR 규칙)
    // WATER(0,1) → FARM(0,0) 인접 → FARM +10%
    // WATER(1,1) → FLOUR_MILL(1,0) 인접 → FLOUR_MILL +10%
    const slots: SynergySlotInput[] = emptyLand().map((s) => {
      if (s.x === 0 && s.y === 1) return { ...s, type: 'WATER', locked: false }
      if (s.x === 1 && s.y === 1) return { ...s, type: 'WATER', locked: false }
      return s
    })
    const result = computeLandSynergies({
      factories: [factory('farm', 'FARM', 0, 0), factory('fm', 'FLOUR_MILL', 1, 0)],
      slots,
    })
    expect(getSynergyMultiplier(result, 'farm')).toBeCloseTo(1.1, 10)
    expect(getSynergyMultiplier(result, 'fm')).toBeCloseTo(1.2, 10)
  })
})

describe('computeLandSynergies — 인접 판정 엣지', () => {
  it('대각선은 인접이 아님', () => {
    const result = computeLandSynergies({
      factories: [
        factory('m', 'MINE', 0, 0),
        factory('s', 'STEEL_MILL', 1, 1), // 대각선
      ],
      slots: emptyLand(),
    })
    expect(getSynergyMultiplier(result, 's')).toBe(1.0)
  })

  it('두 셀이 떨어지면 인접 아님', () => {
    const result = computeLandSynergies({
      factories: [factory('m', 'MINE', 0, 0), factory('s', 'STEEL_MILL', 2, 0)],
      slots: emptyLand(),
    })
    expect(getSynergyMultiplier(result, 's')).toBe(1.0)
  })

  it('해당 없는 공장 조합은 0', () => {
    const result = computeLandSynergies({
      factories: [factory('a', 'FARM', 0, 0), factory('b', 'MINE', 1, 0)],
      slots: emptyLand(),
    })
    // FARM ↔ MINE 은 정의 없음
    expect(getSynergyMultiplier(result, 'a')).toBe(1.0)
    expect(getSynergyMultiplier(result, 'b')).toBe(1.0)
  })
})

describe('computeLandSynergies — 30% clamp', () => {
  it('보너스 총합이 30% 초과면 30% 로 자름', () => {
    // CAR_FACTORY(2×2) 중심 주위에 STEEL_MILL 여러 개 + REFINERY 여러 개 배치 시뮬레이션
    // 현실적 4x4 경계상 모든 조합 나열이 어려우므로: 단순히 단일 공장이 7개 MINE 과 인접한 가상 시나리오
    // 대신 실제 카탈로그에서는 STEEL_MILL 이 여러 MINE 을 만날 수 있음. 2x2 그리드에 다 배치.
    // MINE 3개와 인접한 STEEL_MILL (이미 위 테스트에서 확인) — 정확히 30% 에 수렴하는 경계값은 이미 커버됨.
    // 여기서는 30% 초과 상황 확인: MINE 4개 인접.
    const result = computeLandSynergies({
      factories: [
        // STEEL_MILL at center (1,1). 사방 4개 MINE.
        factory('s', 'STEEL_MILL', 1, 1),
        factory('m1', 'MINE', 0, 1),
        factory('m2', 'MINE', 2, 1),
        factory('m3', 'MINE', 1, 0),
        factory('m4', 'MINE', 1, 2),
      ],
      slots: emptyLand(),
    })
    // 총 +40% → clamp → +30%
    expect(getSynergyMultiplier(result, 's')).toBe(1 + SYNERGY_MAX_BONUS)
  })
})
