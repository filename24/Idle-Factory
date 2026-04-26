import { disassemble, getChoseong } from 'es-hangul'

const HANGUL_SYLLABLE_REGEX = /[가-힯]/
const HANGUL_REGEX = /[가-힯ㄱ-ㅣᄀ-ᇿ]/
const segmenter = new Intl.Segmenter('ko', { granularity: 'word' })

function tokenize(text: string): string[] {
  const tokens: string[] = []
  const segments = segmenter.segment(text)

  for (const segment of segments) {
    if (!segment.isWordLike) continue

    const word = segment.segment
    tokens.push(word)

    if (HANGUL_REGEX.test(word)) {
      const decomposed = disassemble(word)
      if (decomposed !== word) {
        tokens.push(decomposed)
      }

      if (HANGUL_SYLLABLE_REGEX.test(word)) {
        tokens.push(getChoseong(word))
      }
    }
  }

  return tokens
}

function trim(text: string[]): string[] {
  while (text[text.length - 1] === '') text.pop()
  while (text[0] === '') text.shift()
  return text
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tokenizeInternal(
  this: any,
  input: string | number,
  _language?: string,
  prop?: string,
): string[] {
  if (typeof input !== 'string') {
    return [String(input)]
  }

  let tokens: string[]

  if (prop && this.tokenizeSkipProperties?.has(prop)) {
    tokens = [input.toLowerCase()]
  } else {
    tokens = tokenize(input.toLowerCase())
  }

  const trimmed = trim(tokens)

  if (!this.allowDuplicates) {
    return Array.from(new Set(trimmed))
  }

  return trimmed
}

export function createKoreanTokenizer(
  config: {
    stopWords?: string[]
    stemmerSkipProperties?: string | string[]
    tokenizeSkipProperties?: string | string[]
    allowDuplicates?: boolean
  } = {},
) {
  const tokenizerConfig = {
    tokenize: tokenizeInternal,
    language: 'korean',
    stemmerSkipProperties: new Set(
      config.stemmerSkipProperties ? [config.stemmerSkipProperties].flat() : [],
    ),
    tokenizeSkipProperties: new Set(
      config.tokenizeSkipProperties ? [config.tokenizeSkipProperties].flat() : [],
    ),
    stopWords: config.stopWords,
    allowDuplicates: Boolean(config.allowDuplicates),
    normalizationCache: new Map(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tokenizerConfig.tokenize = tokenizeInternal.bind(tokenizerConfig as any)

  return tokenizerConfig
}
