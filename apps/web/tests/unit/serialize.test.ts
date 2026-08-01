/**
 * `toClient` RSC→Client 직렬화 헬퍼 검증.
 *
 * 핵심 관심사는 두 가지다: (1) 2^53 을 넘는 금액이 정밀도를 잃지 않는가,
 * (2) 입력을 변형하지 않는가(불변).
 */

import { describe, expect, it } from 'vitest'
import { toClient } from '../../src/lib/serialize'

describe('toClient', () => {
  it('bigint 를 10진 문자열로 바꾼다', () => {
    expect(toClient(1_000n)).toBe('1000')
    expect(toClient(0n)).toBe('0')
    expect(toClient(-42n)).toBe('-42')
  })

  it('2^53 을 넘는 금액도 정밀도를 잃지 않는다', () => {
    // Number 로 변환하면 마지막 자리가 뭉개지는 값 — 문자열 규칙의 존재 이유다.
    const huge = 9_007_199_254_740_993n // 2^53 + 1
    expect(toClient(huge)).toBe('9007199254740993')
    expect(Number(huge).toString()).not.toBe('9007199254740993')
  })

  it('Date 를 ISO 문자열로 바꾼다', () => {
    const date = new Date('2026-07-31T12:34:56.789Z')
    expect(toClient(date)).toBe('2026-07-31T12:34:56.789Z')
  })

  it('중첩 객체와 배열을 재귀 변환한다', () => {
    const input = {
      money: 5_000n,
      nested: { xp: 12n, at: new Date('2026-01-01T00:00:00.000Z') },
      rows: [{ price: 7n }, { price: 8n }],
    }

    expect(toClient(input)).toEqual({
      money: '5000',
      nested: { xp: '12', at: '2026-01-01T00:00:00.000Z' },
      rows: [{ price: '7' }, { price: '8' }],
    })
  })

  it('스칼라와 null·undefined 는 그대로 통과시킨다', () => {
    expect(toClient('text')).toBe('text')
    expect(toClient(42)).toBe(42)
    expect(toClient(true)).toBe(true)
    expect(toClient(null)).toBeNull()
    expect(toClient(undefined)).toBeUndefined()
  })

  it('빈 객체와 빈 배열을 보존한다', () => {
    expect(toClient({})).toEqual({})
    expect(toClient([])).toEqual([])
  })

  it('입력을 변형하지 않는다', () => {
    const input = { money: 1n, rows: [{ price: 2n }] }
    const before = JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))

    toClient(input)

    const after = JSON.stringify(input, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v))
    expect(after).toBe(before)
    expect(typeof input.money).toBe('bigint')
  })

  it('결과가 JSON 직렬화 가능하다', () => {
    // 이 헬퍼의 존재 이유 그 자체 — 변환 전에는 JSON.stringify 가 TypeError 로 죽는다.
    const input = { money: 10n, at: new Date(0) }
    expect(() => JSON.stringify(input)).toThrow(TypeError)
    expect(() => JSON.stringify(toClient(input))).not.toThrow()
  })
})
