/**
 * Discord 권한 판정 검증.
 *
 * 이 모듈은 서버 설정 변경의 유일한 인가 기준이므로, 실패는 항상 "권한 없음"
 * 쪽으로 떨어져야 한다(fail closed). 특히 `permissions` 는 `Number` 로 다루면
 * 상위 비트가 뭉개져 **없는 권한을 있다고** 판정할 수 있다.
 */

import { describe, expect, it } from 'vitest'
import {
  ADMINISTRATOR,
  MANAGE_GUILD,
  hasManageGuild,
  hasScope,
  isValidGuildId,
  parsePermissions,
} from '../../src/lib/discord/permissions'

describe('parsePermissions', () => {
  it('10진 문자열을 BigInt 로 읽는다', () => {
    expect(parsePermissions('32')).toBe(32n)
    expect(parsePermissions('0')).toBe(0n)
  })

  it('2^53 을 넘는 값도 정확히 읽는다', () => {
    // Number 로 파싱했다면 여기서 어긋난다.
    const huge = '9007199254740993' // 2^53 + 1
    expect(parsePermissions(huge)).toBe(9_007_199_254_740_993n)
  })

  it('잘못된 입력은 0 으로 막는다', () => {
    for (const bad of ['', '   ', 'abc', '12abc', null, undefined, 42, {}, []]) {
      expect(parsePermissions(bad), String(bad)).toBe(0n)
    }
  })

  it('음수를 0 으로 막는다', () => {
    expect(parsePermissions('-1')).toBe(0n)
  })
})

describe('hasManageGuild', () => {
  it('소유자는 항상 통과한다', () => {
    expect(hasManageGuild({ id: '1', owner: true, permissions: '0' })).toBe(true)
  })

  it('ADMINISTRATOR 비트를 인정한다', () => {
    expect(hasManageGuild({ id: '1', permissions: ADMINISTRATOR.toString() })).toBe(true)
  })

  it('MANAGE_GUILD 비트를 인정한다', () => {
    expect(hasManageGuild({ id: '1', permissions: MANAGE_GUILD.toString() })).toBe(true)
  })

  it('상위 비트에 섞여 있어도 찾아낸다', () => {
    // 실제 Discord 권한값은 이렇게 큰 수로 온다.
    const mixed = (MANAGE_GUILD | (1n << 40n)).toString()
    expect(hasManageGuild({ id: '1', permissions: mixed })).toBe(true)
  })

  it('둘 다 없으면 거부한다', () => {
    expect(hasManageGuild({ id: '1', owner: false, permissions: '0' })).toBe(false)
    // 메시지 전송(1<<11) 만 있는 일반 멤버
    expect(hasManageGuild({ id: '1', permissions: (1n << 11n).toString() })).toBe(false)
  })

  it('입력이 없거나 permissions 가 없으면 거부한다', () => {
    expect(hasManageGuild(null)).toBe(false)
    expect(hasManageGuild(undefined)).toBe(false)
    expect(hasManageGuild({ id: '1' })).toBe(false)
  })

  it('permissions 가 손상돼도 거부한다', () => {
    expect(hasManageGuild({ id: '1', permissions: 'not-a-number' })).toBe(false)
  })
})

describe('isValidGuildId', () => {
  it('snowflake 형식을 통과시킨다', () => {
    expect(isValidGuildId('123456789012345678')).toBe(true)
  })

  it('형식에 맞지 않으면 거부한다', () => {
    for (const bad of ['', 'abc', '1234', '1'.repeat(26), '123 ', '12\n34', null, 123]) {
      expect(isValidGuildId(bad), String(bad)).toBe(false)
    }
  })
})

describe('hasScope', () => {
  it('better-auth 의 콤마 결합 형식을 읽는다', () => {
    // 저장 형식이 콤마 join 이다. 공백 구분만 가정하면 항상 거짓이 된다.
    expect(hasScope('identify,email,guilds', 'guilds')).toBe(true)
    expect(hasScope('identify,email', 'guilds')).toBe(false)
  })

  it('공백 구분 형식도 읽는다', () => {
    expect(hasScope('identify email guilds', 'guilds')).toBe(true)
  })

  it('배열도 받는다', () => {
    expect(hasScope(['identify', 'guilds'], 'guilds')).toBe(true)
  })

  it('비어 있거나 없으면 거부한다', () => {
    expect(hasScope(null, 'guilds')).toBe(false)
    expect(hasScope(undefined, 'guilds')).toBe(false)
    expect(hasScope('', 'guilds')).toBe(false)
  })

  it('부분 문자열 일치로 통과시키지 않는다', () => {
    // 'guilds.members.read' 가 있다고 'guilds' 를 인정하면 안 된다.
    expect(hasScope('identify,guilds.members.read', 'guilds')).toBe(false)
  })
})
