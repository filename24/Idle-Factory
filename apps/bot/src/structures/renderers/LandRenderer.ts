/**
 * 토지(Land) 렌더러.
 *
 * Prisma 등 인프라에 의존하지 않는 순수 함수 모음. 호출 측은
 * DB 조회 결과를 아래 DTO 형태로 변환해서 넘겨야 한다.
 *
 * 참조: `docs/design/11-land.md` §렌더링.
 */

import { FACTORY_CATALOG } from '@idle/game-core'
import type { FactoryType, SlotType } from '@idle/game-core'

/** 빈(배치 가능) 슬롯 이모지. */
const EMPTY_CELL = '⬜'

/**
 * 특수 슬롯 타입 → 렌더 이모지 매핑.
 *
 * 참조: `docs/design/11-land.md` §특수 슬롯.
 */
const SPECIAL_SLOT_EMOJI: Readonly<
  Record<Exclude<SlotType, 'NORMAL'>, string>
> = {
  FERTILE: '🌱',
  FOREST: '🌳',
  OIL: '🛢️',
  ORE: '🪨',
  WATER: '💧'
}

/** 0~9 → 위첨자 매핑. 10은 `¹⁰`처럼 두 자리 조합으로 처리한다. */
const SUPERSCRIPT_DIGITS: ReadonlyArray<string> = [
  '⁰',
  '¹',
  '²',
  '³',
  '⁴',
  '⁵',
  '⁶',
  '⁷',
  '⁸',
  '⁹'
]

/**
 * 숫자를 유니코드 위첨자 문자열로 변환한다.
 *
 * @param n 변환할 자연수 (0 이상)
 * @returns 위첨자 문자열 (예: `10 → '¹⁰'`)
 */
export function toSuperscript(n: number): string {
  if (n < 0 || !Number.isFinite(n)) return ''
  const floored = Math.floor(n)
  const s = floored.toString(10)
  let out = ''
  for (const ch of s) {
    const d = ch.charCodeAt(0) - '0'.charCodeAt(0)
    out += SUPERSCRIPT_DIGITS[d] ?? ch
  }
  return out
}

/**
 * 토지 DTO. Prisma `Land`에서 읽어 호출 측이 채운다.
 */
export interface LandDTO {
  /** 가로 셀 수 */
  readonly width: number
  /** 세로 셀 수 */
  readonly height: number
}

/**
 * 슬롯 DTO. Prisma `Slot` 또는 런타임 슬롯 상태에서 파생.
 */
export interface SlotDTO {
  /** 0-based X */
  readonly x: number
  /** 0-based Y */
  readonly y: number
  /** 슬롯 타입 */
  readonly type: SlotType
}

/**
 * 공장 DTO. Prisma `Factory` 요약. anchorX/Y 기준 size만큼 점유.
 */
export interface FactoryDTO {
  /** 공장 종류 (카탈로그 키) */
  readonly type: FactoryType
  /** 1..10 등급 */
  readonly grade: number
  /** 앵커(좌상단) X */
  readonly anchorX: number
  /** 앵커(좌상단) Y */
  readonly anchorY: number
}

/**
 * `renderLand` 결과.
 */
export interface RenderedLand {
  /** 줄바꿈으로 구분된 이모지 그리드 */
  readonly grid: string
  /** 범례 문자열 (빈/특수 슬롯 설명) */
  readonly legend: string
}

/**
 * 토지를 이모지 그리드 문자열로 렌더한다.
 *
 * - 빈 `NORMAL` 슬롯: `⬜`
 * - 특수 슬롯(`FERTILE/FOREST/OIL/ORE/WATER`): 해당 이모지
 * - 공장: `FACTORY_CATALOG[type].emoji` + 등급 위첨자(앵커 셀에만)
 * - T3 2×2 공장: 4셀 모두 같은 이모지, 등급 표기는 앵커만
 *
 * @param land 토지 크기 DTO
 * @param factories 현재 배치된 공장 목록
 * @param slots 슬롯 상태 목록 (특수 슬롯 판정용)
 * @returns 렌더된 그리드와 범례
 */
export function renderLand(
  land: LandDTO,
  factories: ReadonlyArray<FactoryDTO>,
  slots: ReadonlyArray<SlotDTO>
): RenderedLand {
  const slotMap = new Map<string, SlotDTO>()
  for (const s of slots) slotMap.set(cellKey(s.x, s.y), s)

  // 점유 셀 → 공장 매핑(앵커 여부 포함).
  const occupancy = new Map<
    string,
    { factory: FactoryDTO; isAnchor: boolean }
  >()
  for (const f of factories) {
    const { width, height } = FACTORY_CATALOG[f.type].size
    for (let dy = 0; dy < height; dy++) {
      for (let dx = 0; dx < width; dx++) {
        const x = f.anchorX + dx
        const y = f.anchorY + dy
        occupancy.set(cellKey(x, y), {
          factory: f,
          isAnchor: dx === 0 && dy === 0
        })
      }
    }
  }

  const rows: string[] = []
  for (let y = 0; y < land.height; y++) {
    const cells: string[] = []
    for (let x = 0; x < land.width; x++) {
      cells.push(renderCell(x, y, slotMap, occupancy))
    }
    rows.push(cells.join(''))
  }

  return {
    grid: rows.join('\n'),
    legend: buildLegend()
  }
}

/**
 * 단일 셀 렌더링.
 *
 * 공장이 있으면 공장 이모지(+앵커면 등급 위첨자), 그 다음에 특수 슬롯,
 * 마지막으로 빈 셀 순으로 결정한다.
 */
function renderCell(
  x: number,
  y: number,
  slotMap: Map<string, SlotDTO>,
  occupancy: Map<string, { factory: FactoryDTO; isAnchor: boolean }>
): string {
  const key = cellKey(x, y)
  const occ = occupancy.get(key)
  if (occ !== undefined) {
    const emoji = FACTORY_CATALOG[occ.factory.type].emoji
    return occ.isAnchor ? `${emoji}${toSuperscript(occ.factory.grade)}` : emoji
  }

  const slot = slotMap.get(key)
  if (slot !== undefined && slot.type !== 'NORMAL') {
    return SPECIAL_SLOT_EMOJI[slot.type]
  }
  return EMPTY_CELL
}

/** `(x, y)` 좌표 맵 키. */
function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

/** 범례 문자열 생성. i18n은 호출 측에서 교체 가능하도록 단순 포맷. */
function buildLegend(): string {
  const parts = [
    `${EMPTY_CELL} 빈 슬롯`,
    `${SPECIAL_SLOT_EMOJI.FERTILE} 비옥`,
    `${SPECIAL_SLOT_EMOJI.FOREST} 숲`,
    `${SPECIAL_SLOT_EMOJI.OIL} 유전`,
    `${SPECIAL_SLOT_EMOJI.ORE} 광맥`,
    `${SPECIAL_SLOT_EMOJI.WATER} 수원`
  ]
  return parts.join(' · ')
}
