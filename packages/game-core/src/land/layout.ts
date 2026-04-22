/**
 * 토지 배치(공장 놓기) 검증과 특수 슬롯 보너스 계산.
 *
 * 근거: `docs/design/11-land.md` §배치 규칙, §특수 슬롯.
 */

import { FACTORY_CATALOG } from '../factories/catalog'
import type { FactoryType, SlotState, SlotType } from '../types'

/**
 * 배치 실패 사유.
 * - `OUT_OF_BOUNDS`: 토지 경계를 벗어남
 * - `OCCUPIED`: 이미 다른 공장이 있음
 * - `OVERLAP`: (예약) 동일 배치 안에서 겹침
 */
export type PlacementFailureReason = 'OUT_OF_BOUNDS' | 'OCCUPIED' | 'OVERLAP'

/**
 * 배치 가능 여부 검사 결과.
 */
export interface PlacementCheckResult {
  /** 배치 가능하면 true */
  readonly ok: boolean
  /** 실패 시 사유 (ok=true면 undefined) */
  readonly reason?: PlacementFailureReason
  /** 실패 원인이 된 슬롯 좌표 (해당 시) */
  readonly blockingSlot?: { x: number; y: number }
}

/**
 * `canPlace` 입력 파라미터.
 */
export interface CanPlaceParams {
  /** 토지 가로 크기 */
  readonly landWidth: number
  /** 토지 세로 크기 */
  readonly landHeight: number
  /** 현재 슬롯 상태 배열(점유 정보 포함) */
  readonly slots: readonly SlotState[]
  /** 배치할 공장 종류 */
  readonly type: FactoryType
  /** 배치 앵커 X (0-based, 좌상단) */
  readonly anchorX: number
  /** 배치 앵커 Y (0-based, 좌상단) */
  readonly anchorY: number
}

/**
 * 공장이 점유할 모든 셀 좌표 목록.
 *
 * @param anchorX 앵커 X (좌상단)
 * @param anchorY 앵커 Y (좌상단)
 * @param width 공장 너비
 * @param height 공장 높이
 * @returns 점유 셀 좌표 배열
 */
export function getOccupiedCells(
  anchorX: number,
  anchorY: number,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      cells.push({ x: anchorX + dx, y: anchorY + dy })
    }
  }
  return cells
}

/**
 * 주어진 앵커 위치에 공장을 배치할 수 있는지 검사한다.
 *
 * 순서대로 검사:
 *  1. 경계 밖이면 `OUT_OF_BOUNDS`
 *  2. 점유 셀 중 하나라도 다른 공장이 있으면 `OCCUPIED`
 *
 * @param params 입력 파라미터
 * @returns 배치 가능 여부와 실패 사유
 */
export function canPlace(params: CanPlaceParams): PlacementCheckResult {
  const { landWidth, landHeight, slots, type, anchorX, anchorY } = params
  const { width, height } = FACTORY_CATALOG[type].size

  if (anchorX < 0 || anchorY < 0 || anchorX + width > landWidth || anchorY + height > landHeight) {
    return { ok: false, reason: 'OUT_OF_BOUNDS' }
  }

  const cells = getOccupiedCells(anchorX, anchorY, width, height)
  for (const cell of cells) {
    const slot = slots.find((s) => s.x === cell.x && s.y === cell.y)
    if (slot === undefined) continue
    if (slot.factoryId !== null) {
      return {
        ok: false,
        reason: 'OCCUPIED',
        blockingSlot: { x: slot.x, y: slot.y },
      }
    }
  }

  return { ok: true }
}

/**
 * 공장 종류 → 직접 매칭되는 특수 슬롯·보너스 맵.
 *
 * 예: `FARM`은 `FERTILE` 슬롯에서 1.2배.
 * 근거: `docs/design/11-land.md` §특수 슬롯.
 */
const DIRECT_BONUS_MAP: Readonly<Partial<Record<FactoryType, { slot: SlotType; bonus: number }>>> =
  {
    FARM: { slot: 'FERTILE', bonus: 1.2 },
    MINE: { slot: 'ORE', bonus: 1.2 },
    LUMBER: { slot: 'FOREST', bonus: 1.2 },
    OIL_WELL: { slot: 'OIL', bonus: 1.3 },
  }

/**
 * 특수 슬롯에서 공장이 받는 생산 보너스 배수를 반환한다.
 *
 * 매칭되지 않으면 1.0(보너스 없음).
 *
 * @param slotType 슬롯 타입
 * @param factoryType 공장 종류
 * @returns 생산 배수 (1.0 또는 >1.0)
 */
export function getSpecialSlotBonus(slotType: SlotType, factoryType: FactoryType): number {
  const entry = DIRECT_BONUS_MAP[factoryType]
  if (entry !== undefined && entry.slot === slotType) {
    return entry.bonus
  }
  return 1.0
}
