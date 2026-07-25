import { describe, test, expect } from 'vitest'
import { withParams, safeInternalPath } from '../../src/lib/href'

describe('withParams', () => {
  test('쿼리 파라미터를 조립한다', () => {
    expect(withParams('/ranking', { scope: 'guilds' })).toBe('/ranking?scope=guilds')
  })

  test('undefined/null/빈문자열 파라미터는 생략한다', () => {
    expect(withParams('/r', { a: undefined, b: 2, c: null, d: '' })).toBe('/r?b=2')
  })

  test('파라미터가 없으면 베이스만 반환한다', () => {
    expect(withParams('/r', {})).toBe('/r')
  })
})

describe('safeInternalPath (오픈 리다이렉트 방지)', () => {
  test('내부 절대경로는 그대로 허용한다', () => {
    expect(safeInternalPath('/dashboard/me')).toBe('/dashboard/me')
    expect(safeInternalPath('/a/b?c=1')).toBe('/a/b?c=1')
  })

  test('외부 URL 은 fallback 으로 대체한다', () => {
    expect(safeInternalPath('https://evil.com')).toBe('/dashboard')
    expect(safeInternalPath('http://evil.com')).toBe('/dashboard')
  })

  test('프로토콜 상대(//)·백슬래시 우회(/\\)는 차단한다', () => {
    expect(safeInternalPath('//evil.com')).toBe('/dashboard')
    expect(safeInternalPath('/\\evil.com')).toBe('/dashboard')
  })

  test('빈 값/미지정은 fallback 을 반환한다', () => {
    expect(safeInternalPath(undefined)).toBe('/dashboard')
    expect(safeInternalPath(null)).toBe('/dashboard')
    expect(safeInternalPath('')).toBe('/dashboard')
  })

  test('커스텀 fallback 을 지원한다', () => {
    expect(safeInternalPath('https://evil.com', '/login')).toBe('/login')
  })
})
