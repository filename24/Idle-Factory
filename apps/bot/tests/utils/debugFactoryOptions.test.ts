/**
 * `/debug` 공장 부스터 서브커맨드 순수 헬퍼(`debugFactoryOptions`) 유닛 테스트.
 *
 * Sapphire/DB/별칭 의존이 없는 순수 모듈이라 목 없이 그대로 로드해 검증한다.
 * 대상: `parseBoosterOption`(NONE 센티넬 → null), `formatFactoryChoiceLabel`(라벨 형식).
 */

import { describe, expect, it } from 'vitest'
import {
  BOOSTER_OPTION_NONE,
  DEBUG_RAW_BOOSTER_DEFAULT_AMOUNT,
  formatFactoryChoiceLabel,
  parseBoosterOption
} from '../../src/utils/debugFactoryOptions'

describe('parseBoosterOption', () => {
  it('NONE 센티넬은 부스터 해제(null)로 변환한다', () => {
    expect(parseBoosterOption(BOOSTER_OPTION_NONE)).toBeNull()
  })

  it.each(['SAVING', 'RARE', 'SPEED', 'PROFIT'] as const)(
    '%s 는 그대로 통과시킨다',
    (booster) => {
      expect(parseBoosterOption(booster)).toBe(booster)
    }
  )
})

describe('DEBUG_RAW_BOOSTER_DEFAULT_AMOUNT', () => {
  it('기본 지급 수량은 1 이다', () => {
    expect(DEBUG_RAW_BOOSTER_DEFAULT_AMOUNT).toBe(1)
  })
})

describe('formatFactoryChoiceLabel', () => {
  it('부스터·원자재 없는 공장은 "— · #접미" 형식으로 라벨링한다', () => {
    const label = formatFactoryChoiceLabel({
      typeLabel: '광산',
      grade: 1,
      upgradeBooster: null,
      hasRawBooster: false,
      id: 'clabcdef00ff00aa'
    })
    expect(label).toBe('광산 G1 · — · #ff00aa')
  })

  it('부스터 enum 명을 노출하고 원자재 투입 시 🧪 를 붙인다', () => {
    const label = formatFactoryChoiceLabel({
      typeLabel: '농장',
      grade: 3,
      upgradeBooster: 'RARE',
      hasRawBooster: true,
      id: 'clxxxxxxab12cd'
    })
    expect(label).toBe('농장 G3 · RARE · 🧪 · #ab12cd')
  })

  it('id 접미 6자만 노출한다', () => {
    const label = formatFactoryChoiceLabel({
      typeLabel: '제철소',
      grade: 5,
      upgradeBooster: 'SPEED',
      hasRawBooster: false,
      id: 'abcdefghijklmnop'
    })
    expect(label).toContain('#klmnop')
    expect(label).not.toContain('abcdefghij')
  })
})
