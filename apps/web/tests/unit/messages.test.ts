/**
 * 메시지 카탈로그 정합성 테스트.
 *
 * 봇의 i18n-sync 규칙("ko + en-US 동시 수정")을 웹에도 강제한다. 한쪽에만 키를
 * 추가하면 다른 로케일에서 키 문자열이 그대로 화면에 노출되거나 런타임 에러가
 * 난다. 사람이 기억으로 지키는 대신 테스트로 고정한다.
 */

import { describe, test, expect } from 'vitest'
import en from '../../messages/en.json'
import ko from '../../messages/ko.json'

type Catalog = Record<string, unknown>

/** 중첩 객체를 `a.b.c` 평면 키로 펼친다. */
function flatten(obj: Catalog, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(out, flatten(value as Catalog, path))
    } else {
      out[path] = String(value)
    }
  }
  return out
}

/** ICU 보간 placeholder(`{name}`) 이름 집합을 뽑는다. */
function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort()
}

const flatKo = flatten(ko as Catalog)
const flatEn = flatten(en as Catalog)

describe('메시지 카탈로그', () => {
  test('비어 있지 않다', () => {
    expect(Object.keys(flatKo).length).toBeGreaterThan(0)
  })

  test('ko 와 en 의 키 집합이 완전히 일치한다', () => {
    const koKeys = Object.keys(flatKo).sort()
    const enKeys = Object.keys(flatEn).sort()

    expect(enKeys.filter((k) => !koKeys.includes(k))).toEqual([])
    expect(koKeys.filter((k) => !enKeys.includes(k))).toEqual([])
  })

  test('빈 문자열 메시지가 없다', () => {
    const empty = Object.entries({ ...flatKo, ...flatEn })
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key)

    expect(empty).toEqual([])
  })

  test('같은 키의 보간 placeholder 가 로케일 간 일치한다', () => {
    const mismatched = Object.keys(flatKo)
      .filter((key) => flatEn[key] !== undefined)
      .filter(
        (key) => placeholders(flatKo[key]!).join(',') !== placeholders(flatEn[key]!).join(','),
      )

    expect(mismatched).toEqual([])
  })

  test('en 카탈로그에 한글이 남아 있지 않다', () => {
    const untranslated = Object.entries(flatEn)
      .filter(([, value]) => /[가-힣]/.test(value))
      .map(([key]) => key)

    expect(untranslated).toEqual([])
  })
})
