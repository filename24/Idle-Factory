import {
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  computeLandSynergies,
  getOccupiedCells,
  getSpecialSlotBonus,
  getSynergyMultiplier,
  type FactoryType,
  type SlotType,
} from '@idle/game-core'

/**
 * 토지 그리드 뷰모델 조립 — **순수 함수**.
 *
 * Prisma 를 import 하지 않는다. `queries/my-land.ts` 가 DB 에서 행을 읽어
 * 여기에 넘기고, 여기서는 계산만 한다. 이렇게 나누는 이유는 두 가지다:
 *
 *  1. `vitest.config.ts` 의 커버리지 범위가 `src/lib/**` 인데, `../db` 를
 *     import 하는 모듈은 로드 시점에 `DatabaseClient` 를 만들어 버려 유닛
 *     테스트에서 무거운 목 없이는 다룰 수 없다.
 *  2. 2×2 공장 점유·잠금 우선순위·시너지 같은 실제 실수하기 쉬운 로직을
 *     DB 없이 검증할 수 있다.
 *
 * 봇의 `structures/renderers/LandRenderer.ts` 도 같은 이유로 순수 함수 모음이다.
 */

/** 그리드 셀 하나의 표시 종류. */
export type LandCellKind =
  /** 아직 해금되지 않은 슬롯. */
  | 'LOCKED'
  /** 해금됐고 비어 있음. */
  | 'EMPTY'
  /** 해금됐고 비어 있으며 특수 슬롯. */
  | 'SPECIAL'
  /** 공장의 앵커 셀. */
  | 'FACTORY'
  /** 2×2 공장에 덮인 비앵커 셀 — 렌더 시 건너뛴다. */
  | 'COVERED'

/** 셀 위에 놓인 공장 요약. 상세는 별도 페이지에서 본다. */
export interface LandCellFactory {
  readonly id: string
  readonly type: FactoryType
  readonly grade: number
  readonly width: number
  readonly height: number
  /** 특수 슬롯 생산 배수 (1.0 / 1.2 / 1.3). */
  readonly slotBonus: number
  /** 인접 시너지 생산 배수 (1.0 ~ 1.3). */
  readonly synergyBonus: number
}

/** 그리드 셀 한 칸. */
export interface LandCell {
  readonly x: number
  readonly y: number
  readonly kind: LandCellKind
  /** 잠긴 셀도 특수 타입을 가질 수 있다(해금 전까지 보너스 미적용). */
  readonly slotType: SlotType
  readonly locked: boolean
  /** `kind === 'FACTORY'` 일 때만 채워진다. */
  readonly factory: LandCellFactory | null
}

/** {@link buildLandGrid} 에 넘기는 슬롯 행. */
export interface LandSlotRow {
  readonly x: number
  readonly y: number
  readonly type: SlotType
  readonly locked: boolean
}

/** {@link buildLandGrid} 에 넘기는 공장 행. */
export interface LandFactoryRow {
  readonly id: string
  readonly type: FactoryType
  readonly grade: number
  readonly anchorX: number
  readonly anchorY: number
  readonly width: number
  readonly height: number
}

/** 그리드 조립 결과. */
export interface LandGrid {
  readonly width: number
  readonly height: number
  /** row-major 순서. 길이 = width × height. */
  readonly cells: readonly LandCell[]
  readonly unlockedCount: number
  readonly lockedCount: number
  readonly factoryCount: number
}

/** `(x, y)` → `"x,y"`. */
const cellKey = (x: number, y: number): string => `${x},${y}`

/**
 * 슬롯·공장 행에서 4×4 그리드 뷰모델을 만든다.
 *
 * 셀 종류 판정 순서는 봇 렌더러와 **동일해야 한다**:
 * `LOCKED` → `FACTORY`/`COVERED` → `SPECIAL` → `EMPTY`.
 * 잠금이 최우선인 이유는 특수 슬롯이 잠긴 칸에도 배치될 수 있고, 그때는
 * 보너스가 적용되지 않기 때문이다 — 잠긴 칸을 특수로 그리면 유저가 이미
 * 보너스를 받고 있다고 오해한다.
 *
 * 그리드 크기는 `Land.width/height` 행 값이 아니라 game-core 상수를 쓴다.
 * 스키마상 그 두 컬럼은 항상 4 이며, 활성 영역을 정의하는 것은 `Slot.locked` 다.
 *
 * @param slots 해당 토지의 슬롯 행 전부
 * @param factories 해당 토지의 공장 행 전부
 */
export function buildLandGrid(
  slots: readonly LandSlotRow[],
  factories: readonly LandFactoryRow[],
): LandGrid {
  const width = LAND_MAX_WIDTH
  const height = LAND_MAX_HEIGHT

  const slotByCell = new Map<string, LandSlotRow>()
  for (const slot of slots) slotByCell.set(cellKey(slot.x, slot.y), slot)

  // 시너지는 토지 전체를 한 번에 봐야 계산된다.
  const synergyMap = computeLandSynergies({
    factories: factories.map((f) => ({
      id: f.id,
      type: f.type,
      anchorX: f.anchorX,
      anchorY: f.anchorY,
      width: f.width,
      height: f.height,
    })),
    slots: slots.map((s) => ({ x: s.x, y: s.y, type: s.type, locked: s.locked })),
  })

  const anchorByCell = new Map<string, LandFactoryRow>()
  const coveredCells = new Set<string>()

  for (const factory of factories) {
    anchorByCell.set(cellKey(factory.anchorX, factory.anchorY), factory)

    for (const { x, y } of getOccupiedCells(
      factory.anchorX,
      factory.anchorY,
      factory.width,
      factory.height,
    )) {
      // 앵커 자신은 덮인 칸이 아니다. 그리고 데이터가 어긋나 그리드를 벗어난
      // 좌표가 나와도 무시한다 — 순수 함수가 잘못된 입력에 터지면 안 된다.
      if (x === factory.anchorX && y === factory.anchorY) continue
      if (x < 0 || y < 0 || x >= width || y >= height) continue
      coveredCells.add(cellKey(x, y))
    }
  }

  const cells: LandCell[] = []
  let unlockedCount = 0
  let lockedCount = 0

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const key = cellKey(x, y)
      const slot = slotByCell.get(key)
      // 슬롯 행이 없으면 아직 만들어지지 않은 칸으로 보고 잠금 처리한다.
      const locked = slot?.locked ?? true
      const slotType: SlotType = slot?.type ?? 'NORMAL'

      if (locked) lockedCount += 1
      else unlockedCount += 1

      const anchor = anchorByCell.get(key)

      const kind: LandCellKind = locked
        ? 'LOCKED'
        : anchor
          ? 'FACTORY'
          : coveredCells.has(key)
            ? 'COVERED'
            : slotType === 'NORMAL'
              ? 'EMPTY'
              : 'SPECIAL'

      cells.push({
        x,
        y,
        kind,
        slotType,
        locked,
        factory: anchor
          ? {
              id: anchor.id,
              type: anchor.type,
              grade: anchor.grade,
              width: anchor.width,
              height: anchor.height,
              slotBonus: getSpecialSlotBonus(slotType, anchor.type),
              synergyBonus: getSynergyMultiplier(synergyMap, anchor.id),
            }
          : null,
      })
    }
  }

  return { width, height, cells, unlockedCount, lockedCount, factoryCount: factories.length }
}

/**
 * 보유 토지 번호 목록에서 이전/다음 번호를 찾는다.
 *
 * 토지 번호는 연속이 아닐 수 있으므로(`[1, 3, 5]`) 인덱스 ±1 로 계산하면 안 된다.
 *
 * @param ownedIndices 보유 토지 번호(오름차순)
 * @param current 현재 보고 있는 번호
 */
export function findAdjacentLandIndices(
  ownedIndices: readonly number[],
  current: number,
): { readonly prevIndex: number | null; readonly nextIndex: number | null } {
  const position = ownedIndices.indexOf(current)
  if (position === -1) return { prevIndex: null, nextIndex: null }

  return {
    prevIndex: position > 0 ? (ownedIndices[position - 1] ?? null) : null,
    nextIndex: position < ownedIndices.length - 1 ? (ownedIndices[position + 1] ?? null) : null,
  }
}
