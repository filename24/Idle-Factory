import { describe, test, expect } from 'vitest'
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  isLocale,
  resolveLocale,
} from '../../src/i18n/config'

describe('LOCALES', () => {
  test('messages/ 카탈로그와 같은 두 로케일만 노출한다', () => {
    expect([...LOCALES]).toEqual(['ko', 'en'])
  })

  test('기본 로케일은 한국어 — 한국어 우선 제품이다', () => {
    expect(DEFAULT_LOCALE).toBe('ko')
  })

  test('모든 로케일에 표시 라벨이 있다', () => {
    for (const locale of LOCALES) {
      expect(LOCALE_LABELS[locale]).toBeTruthy()
    }
  })
})

describe('isLocale', () => {
  test('지원 로케일에만 true 를 반환한다', () => {
    expect(isLocale('ko')).toBe(true)
    expect(isLocale('en')).toBe(true)
  })

  test('미지원 값·비문자열에는 false 를 반환한다', () => {
    expect(isLocale('en-US')).toBe(false)
    expect(isLocale('fr')).toBe(false)
    expect(isLocale('')).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(42)).toBe(false)
  })
})

describe('resolveLocale', () => {
  test('쿠키에 담긴 지원 로케일을 그대로 채택한다', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('ko')).toBe('ko')
  })

  test('쿠키가 없으면 기본 로케일로 떨어진다', () => {
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE)
  })

  // 쿠키는 사용자가 임의로 바꿀 수 있는 입력이다. 검증 없이 넘기면
  // `messages/${locale}.json` 동적 import 가 경로 조작에 노출된다.
  test('신뢰할 수 없는 쿠키 값은 기본 로케일로 막는다', () => {
    expect(resolveLocale('fr')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale('../../etc/passwd')).toBe(DEFAULT_LOCALE)
    expect(resolveLocale('ko;en')).toBe(DEFAULT_LOCALE)
  })
})

describe('LOCALE_COOKIE', () => {
  test('next-intl 관례인 NEXT_LOCALE 을 쓴다', () => {
    expect(LOCALE_COOKIE).toBe('NEXT_LOCALE')
  })
})
