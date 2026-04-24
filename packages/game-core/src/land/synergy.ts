/**
 * 토지 인접 시너지 계산기.
 *
 * 근거: `docs/design/11-land.md` §인접 시너지 (A-2) / §특수 슬롯 (WATER).
 *
 * 한 토지 위의 **모든 공장 배치와 모든 슬롯 타입**을 받아, 공장별 생산 보너스 배수를
 * `factoryId → multiplier` 맵으로 반환한다.
 *
 * 핵심 규칙:
 *  - 인접은 상·하·좌·우(4방향)만. 대각선은 제외.
 *  - 한 공장이 특정 provider(공장 또는 WATER 슬롯)와 인접한 경우, 얼마나 많은 셀이
 *    인접하든 보너스는 **해당 provider 1건으로만 카운트**한다 (중복 방지).
 *  - 공장 보너스 테이블(`FACTORY_SYNERGY`)은 단방향 (provider → beneficiary).
 *  - WATER 시너지는 **잠금 해제된 슬롯만** provider 자격 부여 (docs §특수 슬롯).
 *  - 공장당 최대 +30% 상한(`SYNERGY_MAX_BONUS`).
 *
 * 결과 배수는 `1.0` ~ `1.0 + SYNERGY_MAX_BONUS` 범위의 실수.
 * 이 값을 `computeFactoryYield`의 `synergyBonus` 로 넘기면 된다.
 */

import type { FactoryType, SlotType } from '../types'

/** 공장당 시너지 보너스의 상한 (docs/11 §인접 시너지 중첩 규칙). */
export const SYNERGY_MAX_BONUS = 0.3

/**
 * 공장 쌍 단방향 인접 시너지 (provider → beneficiary, bonus 비율).
 *
 * docs/11-land.md §인접 시너지 표 그대로. 쌍은 단방향이며 beneficiary 공장이 생산 +X%.
 */
export const FACTORY_SYNERGY: ReadonlyArray<{
  readonly provider: FactoryType
  readonly beneficiary: FactoryType
  readonly bonus: number
}> = [
  { provider: 'MINE', beneficiary: 'STEEL_MILL', bonus: 0.1 },
  { provider: 'OIL_WELL', beneficiary: 'REFINERY', bonus: 0.1 },
  { provider: 'FARM', beneficiary: 'FLOUR_MILL', bonus: 0.1 },
  { provider: 'LUMBER', beneficiary: 'FURNITURE_FACTORY', bonus: 0.1 },
  { provider: 'STEEL_MILL', beneficiary: 'CAR_FACTORY', bonus: 0.05 },
  { provider: 'REFINERY', beneficiary: 'CAR_FACTORY', bonus: 0.05 },
  { provider: 'FLOUR_MILL', beneficiary: 'FOOD_FACTORY', bonus: 0.05 },
]

/**
 * 특수 슬롯 → 인접 공장 시너지.
 *
 * docs/11-land.md §특수 슬롯: 수로 💧 → 인접 농장·제분소 +10%.
 * 잠긴 슬롯은 provider 자격 없음 (구매 전까지 보너스 미적용).
 */
export const SLOT_TYPE_SYNERGY: ReadonlyArray<{
  readonly provider: SlotType
  readonly beneficiary: FactoryType
  readonly bonus: number
}> = [
  { provider: 'WATER', beneficiary: 'FARM', bonus: 0.1 },
  { provider: 'WATER', beneficiary: 'FLOUR_MILL', bonus: 0.1 },
]

/** 한 토지의 배치된 공장 요약. */
export interface SynergyFactoryInput {
  readonly id: string
  readonly type: FactoryType
  readonly anchorX: number
  readonly anchorY: number
  readonly width: number
  readonly height: number
}

/** 한 토지의 슬롯 상태 요약. */
export interface SynergySlotInput {
  readonly x: number
  readonly y: number
  readonly type: SlotType
  readonly locked: boolean
}

/** `computeLandSynergies` 입력. */
export interface ComputeLandSynergiesInput {
  readonly factories: ReadonlyArray<SynergyFactoryInput>
  readonly slots: ReadonlyArray<SynergySlotInput>
}

/** `computeLandSynergies` 결과. 키가 없으면 기본 1.0 으로 간주해도 된다. */
export type SynergyBonusMap = ReadonlyMap<string, number>

const NEIGHBOR_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [0, 1], // S
  [-1, 0], // W
  [1, 0], // E
]

/** `(x, y)` → `"x,y"` 문자열 키. */
const cellKey = (x: number, y: number): string => `${x},${y}`

/**
 * 같은 토지의 모든 공장과 슬롯을 받아 각 공장의 시너지 생산 배수를 계산한다.
 *
 * @param input 같은 `landId` 에 속한 공장/슬롯 목록
 * @returns `factoryId → multiplier(1.0..1.3)` 맵. 시너지 없는 공장은 맵에 없거나 1.0
 */
export function computeLandSynergies(input: ComputeLandSynergiesInput): SynergyBonusMap {
  const { factories, slots } = input

  // 1. 셀 → factoryId / slot 인덱싱.
  const cellToFactory = new Map<string, SynergyFactoryInput>()
  for (const f of factories) {
    for (let dy = 0; dy < f.height; dy++) {
      for (let dx = 0; dx < f.width; dx++) {
        cellToFactory.set(cellKey(f.anchorX + dx, f.anchorY + dy), f)
      }
    }
  }
  const cellToSlot = new Map<string, SynergySlotInput>()
  for (const s of slots) cellToSlot.set(cellKey(s.x, s.y), s)

  // 2. provider 룩업 테이블 — O(1) 검색용.
  //    factoryPairIndex: `${providerType}->${beneficiaryType}` → bonus
  const factoryPairIndex = new Map<string, number>()
  for (const rule of FACTORY_SYNERGY) {
    factoryPairIndex.set(`${rule.provider}->${rule.beneficiary}`, rule.bonus)
  }
  const slotPairIndex = new Map<string, number>()
  for (const rule of SLOT_TYPE_SYNERGY) {
    slotPairIndex.set(`${rule.provider}->${rule.beneficiary}`, rule.bonus)
  }

  const result = new Map<string, number>()

  // 3. 각 공장별 인접 provider 수집.
  for (const beneficiary of factories) {
    // 중복 인접 1회 카운트를 위해 provider 별 set 유지.
    const seenFactoryProviders = new Set<string>() // factoryId
    const seenSlotProviders = new Set<string>() // cellKey — 같은 WATER 슬롯 1회
    let totalBonus = 0

    // beneficiary 가 점유한 각 셀의 4방향 이웃을 검사.
    for (let dy = 0; dy < beneficiary.height; dy++) {
      for (let dx = 0; dx < beneficiary.width; dx++) {
        const cx = beneficiary.anchorX + dx
        const cy = beneficiary.anchorY + dy
        for (const [ox, oy] of NEIGHBOR_OFFSETS) {
          const nx = cx + ox
          const ny = cy + oy
          const nKey = cellKey(nx, ny)

          // 3a. 이웃 셀이 다른 공장 소속인지.
          const neighFactory = cellToFactory.get(nKey)
          if (neighFactory && neighFactory.id !== beneficiary.id) {
            if (!seenFactoryProviders.has(neighFactory.id)) {
              seenFactoryProviders.add(neighFactory.id)
              const pair = `${neighFactory.type}->${beneficiary.type}`
              const bonus = factoryPairIndex.get(pair)
              if (bonus !== undefined) totalBonus += bonus
            }
            // 공장에 점유된 셀은 슬롯 provider 자격 없음 (공장이 먼저).
            continue
          }

          // 3b. 이웃 셀이 특수 슬롯 provider 인지 (잠금 해제된 것만).
          const neighSlot = cellToSlot.get(nKey)
          if (!neighSlot || neighSlot.locked) continue
          if (neighSlot.type === 'NORMAL') continue
          if (seenSlotProviders.has(nKey)) continue
          const slotPair = `${neighSlot.type}->${beneficiary.type}`
          const slotBonus = slotPairIndex.get(slotPair)
          if (slotBonus !== undefined) {
            seenSlotProviders.add(nKey)
            totalBonus += slotBonus
          }
        }
      }
    }

    // 4. +30% clamp.
    if (totalBonus > SYNERGY_MAX_BONUS) totalBonus = SYNERGY_MAX_BONUS
    if (totalBonus > 0) result.set(beneficiary.id, 1 + totalBonus)
  }

  return result
}

/**
 * `computeLandSynergies` 결과에서 특정 factoryId 의 배수를 꺼낸다.
 *
 * 매칭되는 엔트리가 없으면 `1.0` 을 반환. `harvest` 경로의 폴백 용.
 */
export function getSynergyMultiplier(map: SynergyBonusMap, factoryId: string): number {
  return map.get(factoryId) ?? 1.0
}
