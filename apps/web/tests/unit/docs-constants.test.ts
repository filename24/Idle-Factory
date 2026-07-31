/**
 * 문서 상수 드리프트 가드.
 *
 * 파리티 감사에서 `content/docs` 의 수치가 `@idle/game-core` 와 어긋난 사례가
 * 여럿 나왔다(토지 시작 크기 4×4 vs 실제 3×3, 원료 부스터 드롭 티어 등).
 * 사람이 기억으로 맞추는 대신, 코드 상수가 바뀌면 이 테스트가 깨지도록 고정한다.
 *
 * 정규식이 아무것도 못 찾으면 **명시적으로 실패**시킨다. 조용히 통과하면
 * 가드가 있다는 착각만 남고 실제로는 아무것도 지키지 못한다.
 *
 * 같은 이유로 `packages/game-core/tests/simulation/basePrices.test.ts` 가
 * `prisma/seed.ts` 를 텍스트로 파싱해 검증한다 — 그 선례를 따른다.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LAND_INITIAL_HEIGHT,
  LAND_INITIAL_WIDTH,
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  MAX_EXPANSIONS_PER_LAND,
  RARE_BOOSTER_DROP_RATE,
  RAW_BOOSTER_UNLOCK_LEVEL,
  SPECIAL_SLOT_PROBABILITY,
  SYNERGY_MAX_BONUS,
  landExpansionCost,
} from '@idle/game-core'

const DOCS_ROOT = join(__dirname, '../../content/docs')

/** 문서를 읽는다. 없으면 경로와 함께 실패시킨다. */
function readDoc(relativePath: string): string {
  const full = join(DOCS_ROOT, relativePath)
  try {
    return readFileSync(full, 'utf8')
  } catch {
    throw new Error(`문서를 읽을 수 없다: ${full}`)
  }
}

/**
 * 문서에서 패턴을 찾아 첫 캡처 그룹을 돌려준다.
 *
 * 못 찾으면 던진다 — 문서가 리포맷되어 정규식이 빗나갔을 때 조용히 통과하는
 * 것을 막는다.
 */
function extract(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern)
  if (!match?.[1]) {
    throw new Error(`문서에서 "${label}" 를 찾지 못했다. 정규식이 낡았거나 문서가 바뀌었다.`)
  }
  return match[1]
}

describe('land-slots.mdx ↔ game-core', () => {
  const doc = readDoc('facilities/land-slots.mdx')

  it('최대 토지 크기를 정확히 적는다', () => {
    const value = extract(doc, /\*\*(\d)×(?:\d) \(\d+슬롯\)\*\* 크기/, '최대 토지 크기')
    expect(Number(value)).toBe(LAND_MAX_WIDTH)
    expect(LAND_MAX_WIDTH * LAND_MAX_HEIGHT).toBe(16)
  })

  it('시작 크기를 정확히 적는다', () => {
    // 감사에서 "4×4로 시작"이라 잘못 적혀 있던 부분이다.
    const value = extract(doc, /\*\*(\d)×(?:\d) \((\d+)슬롯\)\*\*이 열린/, '시작 토지 크기')
    expect(Number(value)).toBe(LAND_INITIAL_WIDTH)
    expect(doc).toContain(`(${LAND_INITIAL_WIDTH * LAND_INITIAL_HEIGHT}슬롯)`)
  })

  it('잠긴 슬롯 개수를 정확히 적는다', () => {
    const locked = LAND_MAX_WIDTH * LAND_MAX_HEIGHT - LAND_INITIAL_WIDTH * LAND_INITIAL_HEIGHT
    const value = extract(doc, /나머지 (\d+)칸은 잠겨/, '잠긴 슬롯 수')
    expect(Number(value)).toBe(locked)
    expect(locked).toBe(MAX_EXPANSIONS_PER_LAND)
  })

  it('특수 슬롯 확률을 정확히 적는다', () => {
    const value = extract(doc, /(\d+)%\s*(?:확률|)/, '특수 슬롯 확률')
    expect(Number(value)).toBe(Math.round(SPECIAL_SLOT_PROBABILITY * 100))
  })

  it('시너지 상한을 정확히 적는다', () => {
    const value = extract(doc, /최대 \*\*\+(\d+)%까지 중첩\*\*/, '시너지 상한')
    expect(Number(value)).toBe(Math.round(SYNERGY_MAX_BONUS * 100))
  })

  it('슬롯 확장 비용 표가 공식과 일치한다', () => {
    // 토지 1번의 1차·7차 확장 비용을 표에서 찾아 대조한다.
    const first = landExpansionCost(1, 1).toLocaleString('en-US')
    const last = landExpansionCost(1, MAX_EXPANSIONS_PER_LAND).toLocaleString('en-US')
    expect(doc, `1차 확장 비용 ${first}원`).toContain(`${first}원`)
    expect(doc, `7차 확장 비용 ${last}원`).toContain(`${last}원`)
  })
})

describe('materials-trading.mdx ↔ game-core', () => {
  const doc = readDoc('economy/materials-trading.mdx')

  it('원료 부스터 드롭률을 티어별로 정확히 적는다', () => {
    // 감사에서 "T3 공장 저확률 드롭"이라 잘못 적혀 있던 부분이다.
    const t1 = extract(doc, /T1은\s*\n?\s*([\d.]+)%/, 'T1 드롭률')
    const t2 = extract(doc, /T2는 ([\d.]+)%/, 'T2 드롭률')
    expect(Number(t1)).toBe(RARE_BOOSTER_DROP_RATE.T1 * 100)
    expect(Number(t2)).toBe(RARE_BOOSTER_DROP_RATE.T2 * 100)
  })

  it('T3 가 드롭 대상이 아님을 명시한다', () => {
    expect(RARE_BOOSTER_DROP_RATE.T3).toBe(0)
    expect(doc).toMatch(/T3 공장은 드롭 대상이 아닙니다/)
  })

  it('원료 부스터 해금 레벨을 정확히 적는다', () => {
    const value = extract(doc, /\*\*캐릭터 레벨 (\d+)\*\*/, '원료 부스터 해금 레벨')
    expect(Number(value)).toBe(RAW_BOOSTER_UNLOCK_LEVEL)
  })
})

describe('factories.mdx ↔ game-core', () => {
  const doc = readDoc('facilities/factories.mdx')

  it('희귀 부스터 드롭률 표기가 실제 값과 일치한다', () => {
    expect(doc).toContain(`T1 ${RARE_BOOSTER_DROP_RATE.T1 * 100}%`)
    expect(doc).toContain(`T2 ${RARE_BOOSTER_DROP_RATE.T2 * 100}%`)
  })

  it('미구현 모드에 대한 경고가 남아 있다', () => {
    // AUTO_BUY/PARTIAL 이 실제로 구현되면 이 테스트를 지우고 경고도 제거할 것.
    expect(doc).toMatch(/세 모드 모두 '대기'로 동작합니다/)
  })
})
