/**
 * 서버 관리자 인가 가드 검증 — 부정 케이스 중심.
 *
 * 이 가드가 뚫리면 임의의 유저가 남의 서버 세율·언어를 바꾼다. 그래서
 * 검증의 무게가 "통과하는가"보다 **"확실히 막는가"**에 있다:
 *  - 어느 단계에서 실패하든 통과하지 않는다(fail closed).
 *  - Discord 조회 실패를 "일단 허용"으로 흘리지 않는다.
 *  - 형식이 틀린 guildId 는 I/O 이전에 막는다.
 *  - `NOT_MEMBER` 와 `FORBIDDEN` 이 클라이언트에서 구분되지 않는다.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSession = vi.fn()
const getAccessToken = vi.fn()
const guildFindFirst = vi.fn()
const fetchUserGuilds = vi.fn()

vi.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => getSession(...a),
      getAccessToken: (...a: unknown[]) => getAccessToken(...a),
    },
  },
}))
vi.mock('../../src/lib/db', () => ({
  db: { guild: { findFirst: (...a: unknown[]) => guildFindFirst(...a) } },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('../../src/lib/discord/guilds', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/discord/guilds')>(
    '../../src/lib/discord/guilds',
  )
  return { ...actual, fetchUserGuilds: (...a: unknown[]) => fetchUserGuilds(...a) }
})

import { requireGuildAdmin } from '../../src/lib/guild-admin/authorize'

const GUILD_A = '111111111111111111'
const GUILD_B = '222222222222222222'

/** 모든 단계를 통과하는 기본 상태로 되돌린다. */
function arrangeHappyPath(): void {
  getSession.mockResolvedValue({ user: { id: 'auth-1' } })
  getAccessToken.mockResolvedValue({ accessToken: 'tok', scopes: ['identify', 'email', 'guilds'] })
  fetchUserGuilds.mockResolvedValue([{ id: GUILD_A, owner: true, permissions: '0' }])
  guildFindFirst.mockResolvedValue({ id: GUILD_A })
}

beforeEach(() => {
  vi.clearAllMocks()
  arrangeHappyPath()
})

describe('requireGuildAdmin — 통과', () => {
  it('관리자면 검증된 guildId 를 돌려준다', async () => {
    const result = await requireGuildAdmin(GUILD_A)
    expect(result).toEqual({ ok: true, guildId: GUILD_A, authUserId: 'auth-1' })
  })

  it('ManageGuild 비트만 있어도 통과한다', async () => {
    fetchUserGuilds.mockResolvedValue([{ id: GUILD_A, owner: false, permissions: '32' }])
    expect((await requireGuildAdmin(GUILD_A)).ok).toBe(true)
  })
})

describe('requireGuildAdmin — 거부', () => {
  it('형식이 틀린 guildId 는 I/O 이전에 막는다', async () => {
    for (const bad of ['', 'abc', '1234', null, 123, '1'.repeat(26)]) {
      const result = await requireGuildAdmin(bad)
      expect(result, String(bad)).toMatchObject({ ok: false, code: 'INVALID_GUILD_ID' })
    }
    // 세션 조회조차 하지 않았어야 한다.
    expect(getSession).not.toHaveBeenCalled()
    expect(fetchUserGuilds).not.toHaveBeenCalled()
  })

  it('세션이 없으면 거부하고 Discord 를 부르지 않는다', async () => {
    getSession.mockResolvedValue(null)
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      status: 401,
    })
    expect(fetchUserGuilds).not.toHaveBeenCalled()
  })

  it('guilds 스코프가 없으면 재동의를 요구한다', async () => {
    // 스코프 추가 이전에 발급된 세션이 여기 걸린다.
    getAccessToken.mockResolvedValue({ accessToken: 'tok', scopes: ['identify', 'email'] })
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({
      ok: false,
      code: 'SCOPE_REQUIRED',
    })
    expect(fetchUserGuilds).not.toHaveBeenCalled()
  })

  it('토큰이 없으면 재동의를 요구한다', async () => {
    getAccessToken.mockResolvedValue(null)
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({ ok: false, code: 'SCOPE_REQUIRED' })
  })

  it('토큰 갱신이 실패해도 통과시키지 않는다', async () => {
    getAccessToken.mockRejectedValue(new Error('refresh failed'))
    expect((await requireGuildAdmin(GUILD_A)).ok).toBe(false)
  })

  it('Discord 조회 실패를 절대 통과로 흘리지 않는다', async () => {
    // 이걸 "일단 허용"으로 처리하면 Discord 장애가 곧 인가 우회가 된다.
    fetchUserGuilds.mockResolvedValue(null)
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({
      ok: false,
      code: 'DISCORD_UNAVAILABLE',
      status: 503,
    })
  })

  it('멤버가 아니면 거부한다', async () => {
    fetchUserGuilds.mockResolvedValue([{ id: GUILD_B, owner: true }])
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({ ok: false, code: 'NOT_MEMBER' })
  })

  it('멤버지만 권한이 없으면 거부한다', async () => {
    fetchUserGuilds.mockResolvedValue([{ id: GUILD_A, owner: false, permissions: '0' }])
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({ ok: false, code: 'FORBIDDEN' })
  })

  it('NOT_MEMBER 와 FORBIDDEN 이 같은 상태 코드를 준다', async () => {
    // 다르면 임의 snowflake 에 대한 멤버십 오라클이 된다.
    fetchUserGuilds.mockResolvedValue([{ id: GUILD_B, owner: true }])
    const notMember = await requireGuildAdmin(GUILD_A)

    fetchUserGuilds.mockResolvedValue([{ id: GUILD_A, owner: false, permissions: '0' }])
    const forbidden = await requireGuildAdmin(GUILD_A)

    expect(notMember.ok).toBe(false)
    expect(forbidden.ok).toBe(false)
    expect(notMember.ok === false && notMember.status).toBe(403)
    expect(forbidden.ok === false && forbidden.status).toBe(403)
  })

  it('봇이 없는 서버는 등록 안내로 떨어진다', async () => {
    guildFindFirst.mockResolvedValue(null)
    expect(await requireGuildAdmin(GUILD_A)).toMatchObject({
      ok: false,
      code: 'GUILD_NOT_REGISTERED',
    })
  })
})

describe('requireGuildAdmin — 위조된 guildId', () => {
  it('A 의 관리자가 B 를 지정하면 막힌다', async () => {
    // 이 스위트에서 가장 중요한 케이스다. A 서버 관리자가 폼의 hidden input 을
    // B 로 바꿔 보내는 시나리오 — UI 를 숨기는 것은 인가가 아니다.
    fetchUserGuilds.mockResolvedValue([{ id: GUILD_A, owner: true, permissions: '0' }])

    const result = await requireGuildAdmin(GUILD_B)

    expect(result).toMatchObject({ ok: false, code: 'NOT_MEMBER', status: 403 })
    // B 의 행을 조회하지도 않았어야 한다.
    expect(guildFindFirst).not.toHaveBeenCalled()
  })
})
