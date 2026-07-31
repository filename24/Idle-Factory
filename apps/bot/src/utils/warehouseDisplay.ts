/**
 * 창고 재고 표시 헬퍼.
 *
 * `/warehouse view` 와 `/profile` 이 공유한다. Prisma·discord.js 인스턴스에
 * 의존하지 않는 순수 문자열 조립이라 단위 테스트가 DB 없이 돈다.
 */

import type { TFunction } from '@sapphire/plugin-i18next'
import {
  MATERIAL_TYPES,
  capacityOf,
  computeUsed,
  isValidWarehouseGrade,
  type MaterialBag,
  type MaterialType
} from '@idle/game-core'
import { formatBigInt } from '../structures/renderers/FactoryRenderer'
import { localizeMaterial } from './enumLocale'

/**
 * 프로필 인라인 창고 섹션이 소비할 수 있는 최대 문자 수.
 *
 * Components v2 는 메시지 전체 텍스트 4,000자 상한이 있다
 * (`.claude/skills/componentsv2-builder/SKILL.md` §전송 전 체크리스트).
 * 자재는 `WarehouseStack @@unique([warehouseId, material])` 때문에 현재
 * 최대 13종이라 정상 경로에서는 400자를 넘지 않지만, `count` 는 상한 없는
 * BigInt 이고 자재 종류도 앞으로 늘 수 있다. 상한을 넘으면 Discord API 가
 * 응답 전체를 거절하므로, 잘라서라도 프로필이 뜨게 한다.
 */
export const PROFILE_WAREHOUSE_MAX_CHARS = 1_500

/** `MaterialType` → 표시 순서 인덱스. */
const ORDER: ReadonlyMap<MaterialType, number> = new Map(
  MATERIAL_TYPES.map((material, index) => [material, index] as const)
)

/** 정렬 순서를 모르는 자재를 목록 맨 뒤로 보내기 위한 순위. */
const UNKNOWN_ORDER = MATERIAL_TYPES.length

/** 재고 표시에 필요한 최소 형태 (Prisma 행 / `WarehouseView.stacks` 양쪽 호환). */
export interface StackLike {
  readonly material: MaterialType
  readonly count: bigint
}

/**
 * 표시할 재고만 남겨 자재 선언 순서로 정렬한 **새 배열**을 반환한다.
 *
 * `count === 0n` 인 행을 제거한다 — 자재 소비는 `decrement` 만 하고 행을
 * 지우지 않아 잔량 0 인 스택이 남는다.
 *
 * @param stacks 원본 재고 목록 (변경하지 않음)
 * @returns 필터·정렬된 새 배열
 */
export function visibleStacks(stacks: readonly StackLike[]): StackLike[] {
  return stacks
    .filter((stack) => stack.count > 0n)
    .slice()
    .sort(
      (a, b) =>
        (ORDER.get(a.material) ?? UNKNOWN_ORDER) -
        (ORDER.get(b.material) ?? UNKNOWN_ORDER)
    )
}

/**
 * 자재별 `• 곡물: 500` 형태의 표시 라인 배열을 만든다.
 *
 * @param t 대상 로케일 `t` 함수
 * @param stacks 원본 재고 목록
 * @returns 표시 라인 배열 (재고가 없으면 빈 배열)
 */
export function stackLines(
  t: TFunction,
  stacks: readonly StackLike[]
): string[] {
  return visibleStacks(stacks).map(
    (stack) =>
      `• ${localizeMaterial(t, stack.material)}: ${formatBigInt(stack.count)}`
  )
}

/** 프로필에 인라인되는 창고 섹션. */
export interface WarehouseSection {
  /** 프로필 본문 뒤에 붙일 블록. */
  readonly body: string
  /** 문자 예산 때문에 생략된 자재가 있을 때만 채워지는 `-#` 푸터 문구. */
  readonly footer?: string
}

/**
 * 재고 목록 위에 올릴 헤더를 만든다.
 *
 * `**보관 자원** · 1,240 / 9,000 슬롯` 형태. 슬롯 수는 개수 합이 아니라
 * `개수 × 부피 계수` 합이다(광석 1개 = 2슬롯, 원유 1개 = 5슬롯).
 * 유효 범위를 벗어난 등급이면 `capacityOf` 가 `RangeError` 를 던지므로 용량
 * 부분을 생략해 커맨드 전체가 실패하지 않게 한다.
 */
function buildHeader(
  t: TFunction,
  grade: number,
  stacks: readonly StackLike[]
): string {
  const label = `**${t('game:warehouse.view.fields.stacks')}**`
  if (!isValidWarehouseGrade(grade)) return label

  const bag: MaterialBag = {}
  for (const stack of stacks) {
    bag[stack.material] = (bag[stack.material] ?? 0n) + stack.count
  }

  const slots = t('game:warehouse.view.slots', {
    used: formatBigInt(computeUsed(bag)),
    capacity: formatBigInt(capacityOf(grade))
  })
  return `${label} · ${slots}`
}

/**
 * `/profile` 에 인라인할 창고 섹션을 조립한다.
 *
 * @param t 대상 로케일 `t` 함수
 * @param grade 창고 등급
 * @param stacks 창고 재고 목록
 * @param maxChars 재고 라인에 허용할 누적 문자 예산
 * @returns 본문 + (생략이 발생했을 때만) 푸터
 */
export function buildProfileWarehouseSection(
  t: TFunction,
  grade: number,
  stacks: readonly StackLike[],
  maxChars: number = PROFILE_WAREHOUSE_MAX_CHARS
): WarehouseSection {
  const header = buildHeader(t, grade, stacks)
  const lines = stackLines(t, stacks)

  if (lines.length === 0) {
    return { body: `${header}\n${t('game:warehouse.view.empty')}` }
  }

  const shown: string[] = []
  let budget = maxChars
  for (const line of lines) {
    // 줄바꿈 1자를 포함해 예산에서 차감한다.
    const cost = line.length + 1
    if (cost > budget) break
    shown.push(line)
    budget -= cost
  }

  const omitted = lines.length - shown.length
  return {
    body: [header, ...shown].join('\n'),
    footer:
      omitted > 0
        ? t('game:profile.warehouseMore', { count: omitted })
        : undefined
  }
}
