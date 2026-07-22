import { describe, expect, it } from 'vitest'

import { createKoreanTokenizer } from '../../../src/lib/korean-tokenizer'

/**
 * 한글 형태소 토크나이저 단위 테스트.
 * 순수 함수(외부 I/O 없음)이므로 커버리지 시드 1순위 — issue #29.
 */
describe('createKoreanTokenizer', () => {
  it('splits a sentence into per-word tokens', () => {
    const { tokenize } = createKoreanTokenizer()

    const tokens = tokenize('빨간 사과')

    // 원형 단어가 각각 분리되어 포함된다.
    expect(tokens).toContain('빨간')
    expect(tokens).toContain('사과')
  })

  it('emits the disassembled jamo form for Hangul words', () => {
    const { tokenize } = createKoreanTokenizer()

    const tokens = tokenize('사과')

    // 원형 + 자모 분해 + 초성 세 갈래를 모두 낸다.
    expect(tokens).toEqual(['사과', 'ㅅㅏㄱㅗㅏ', 'ㅅㄱ'])
  })

  it('extracts choseong (leading consonants) for syllable words', () => {
    const { tokenize } = createKoreanTokenizer()

    const tokens = tokenize('빨간')

    expect(tokens).toContain('ㅃㄱ')
  })

  it('lowercases input before tokenizing', () => {
    const { tokenize } = createKoreanTokenizer()

    expect(tokenize('Hello')).toEqual(['hello'])
  })

  it('coerces non-string input to a single string token', () => {
    const { tokenize } = createKoreanTokenizer()

    expect(tokenize(123)).toEqual(['123'])
  })

  it('deduplicates tokens by default', () => {
    const { tokenize } = createKoreanTokenizer()

    // 같은 단어가 두 번 나와도 기본은 중복 제거 → 3개(원형·자모·초성).
    const tokens = tokenize('사과 사과')

    expect(tokens).toEqual(['사과', 'ㅅㅏㄱㅗㅏ', 'ㅅㄱ'])
  })

  it('keeps duplicates when allowDuplicates is enabled', () => {
    const { tokenize } = createKoreanTokenizer({ allowDuplicates: true })

    const tokens = tokenize('사과 사과')

    expect(tokens).toHaveLength(6)
    expect(tokens).toEqual(['사과', 'ㅅㅏㄱㅗㅏ', 'ㅅㄱ', '사과', 'ㅅㅏㄱㅗㅏ', 'ㅅㄱ'])
  })

  it('skips tokenization for configured properties', () => {
    const { tokenize } = createKoreanTokenizer({
      tokenizeSkipProperties: 'id',
    })

    // prop 이 skip 집합에 있으면 통째로 소문자화만 하고 분해하지 않는다.
    expect(tokenize('빨간 사과', 'korean', 'id')).toEqual(['빨간 사과'])
  })

  it('still tokenizes properties not in the skip set', () => {
    const { tokenize } = createKoreanTokenizer({
      tokenizeSkipProperties: 'id',
    })

    const tokens = tokenize('빨간 사과', 'korean', 'name')

    expect(tokens).toContain('빨간')
    expect(tokens).toContain('사과')
  })
})
