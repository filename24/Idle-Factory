import { describe, test, expect } from 'vitest'
import { formatInt, formatKoreanCompact, formatPercent, formatRank } from '../../src/lib/format'

describe('formatInt', () => {
  test('bigint 을 천 단위 콤마로 포맷한다', () => {
    expect(formatInt(1234567n)).toBe('1,234,567')
  })

  test('문자열 정수를 포맷한다', () => {
    expect(formatInt('1000')).toBe('1,000')
  })

  test('0 과 음수를 처리한다', () => {
    expect(formatInt(0)).toBe('0')
    expect(formatInt(-1234)).toBe('-1,234')
  })

  test('숫자가 아닌 입력은 방어적으로 0 을 반환한다', () => {
    expect(formatInt('not-a-number')).toBe('0')
  })
})

describe('formatKoreanCompact', () => {
  test('억 단위를 소수 1자리로 압축한다', () => {
    expect(formatKoreanCompact(123456789)).toBe('1.2억')
  })

  test('만 단위를 압축한다', () => {
    expect(formatKoreanCompact(12345)).toBe('1.2만')
  })

  test('조 단위를 압축한다', () => {
    expect(formatKoreanCompact(1000000000000n)).toBe('1조')
  })

  test('만 미만은 콤마 그룹핑된 원값을 반환한다', () => {
    expect(formatKoreanCompact(9999)).toBe('9,999')
    expect(formatKoreanCompact(0)).toBe('0')
  })
})

describe('formatPercent', () => {
  test('비율을 백분율로 변환한다', () => {
    expect(formatPercent(0.05)).toBe('5%')
    expect(formatPercent(0.1)).toBe('10%')
  })

  test('소수 자리수를 지원한다', () => {
    expect(formatPercent(0.155, 1)).toBe('15.5%')
  })

  test('유한하지 않은 값은 0% 를 반환한다', () => {
    expect(formatPercent(Number.NaN)).toBe('0%')
  })
})

describe('formatRank', () => {
  test('순위를 "N위"로 표기한다', () => {
    expect(formatRank(1)).toBe('1위')
  })
})
