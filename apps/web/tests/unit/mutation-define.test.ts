/**
 * `defineGameMutation` 조립 순서·실패 처리 검증.
 *
 * 이 래퍼가 모든 게임 쓰기의 유일한 통로이므로, 여기서 보장하는 성질이
 * 곧 뮤테이션 계층 전체의 보안 속성이다:
 *  - 신원 → 레이트리밋 → 파싱 → 소유권 → 실행 순서가 지켜지는가
 *  - 어느 단계에서 실패하든 `run` 과 `revalidatePath` 가 실행되지 않는가
 *  - 어떤 경우에도 reject 하지 않는가
 */

import { describe, expect, it, vi } from 'vitest'

// db 는 모듈 로드 시 DatabaseClient 를 생성하므로 유닛 테스트에서는 대체한다.
vi.mock('../../src/lib/db', () => ({ db: {} }))
// 세션 해석은 next/headers 와 better-auth 를 끌어온다 — deps 로 주입하므로
// 모듈 자체는 로드만 되면 된다.
vi.mock('../../src/lib/auth', () => ({ auth: { api: { getSession: async () => null } } }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import { defineGameMutation } from '../../src/lib/mutation/define'
import { createMemoryStore } from '../../src/lib/mutation/rate-limit'
import { infraFail } from '../../src/lib/mutation/result'
import type { GameSession } from '../../src/lib/mutation/session'

const SESSION: GameSession = {
  authUserId: 'auth-1',
  gameUserId: 'game-1',
  consented: true,
}

/** 성공 세션을 돌려주는 해석기. */
const okSession = async () => SESSION

/** 호출 순서를 기록하는 기본 옵션 묶음. */
function harness(overrides: Record<string, unknown> = {}) {
  const calls: string[] = []
  const revalidated: string[] = []

  const mutate = defineGameMutation({
    name: 'test.action',
    parse: (raw) => {
      calls.push('parse')
      const value = raw as { amount?: unknown }
      if (typeof value?.amount !== 'number') throw new Error('amount 는 숫자여야 한다')
      return { amount: value.amount }
    },
    run: async (_ctx, input) => {
      calls.push('run')
      return { doubled: input.amount * 2, money: 10n }
    },
    revalidate: ['/dashboard/me'],
    deps: {
      resolveSession: async () => {
        calls.push('session')
        return okSession()
      },
      revalidatePath: (path) => {
        revalidated.push(path)
      },
    },
    ...overrides,
  })

  return { mutate, calls, revalidated }
}

describe('defineGameMutation — 성공 경로', () => {
  it('결과를 직렬화해 돌려주고 경로를 재검증한다', async () => {
    const { mutate, revalidated } = harness()

    const result = await mutate({ amount: 21 })

    expect(result).toEqual({ ok: true, data: { doubled: 42, money: '10' } })
    expect(revalidated).toEqual(['/dashboard/me'])
  })

  it('반환 페이로드가 JSON 직렬화 가능하다', async () => {
    const { mutate } = harness()
    const result = await mutate({ amount: 1 })
    // bigint 가 그대로 남아 있으면 RSC 경계에서 터진다.
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('신원 → 파싱 → 실행 순서를 지킨다', async () => {
    const { mutate, calls } = harness()
    await mutate({ amount: 1 })
    expect(calls).toEqual(['session', 'parse', 'run'])
  })
})

describe('defineGameMutation — 실패 경로', () => {
  it('세션이 없으면 파싱조차 하지 않는다', async () => {
    const { mutate, calls, revalidated } = harness({
      deps: {
        resolveSession: async () => infraFail('UNAUTHENTICATED'),
        revalidatePath: () => undefined,
      },
    })

    const result = await mutate({ amount: 1 })

    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED', status: 401 })
    expect(calls).not.toContain('parse')
    expect(calls).not.toContain('run')
    expect(revalidated).toEqual([])
  })

  it('입력이 잘못되면 INVALID_INPUT 이고 run 이 실행되지 않는다', async () => {
    const { mutate, calls, revalidated } = harness()

    const result = await mutate({ amount: 'not-a-number' })

    expect(result).toMatchObject({ ok: false, code: 'INVALID_INPUT', status: 400 })
    expect(calls).not.toContain('run')
    expect(revalidated).toEqual([])
  })

  it('파서 예외 메시지를 유저에게 노출하지 않는다', async () => {
    const { mutate } = harness({
      parse: () => {
        throw new Error('내부 스키마: users.secret_column')
      },
    })

    const result = await mutate({})

    expect(JSON.stringify(result)).not.toContain('secret_column')
  })

  it('레이트 리밋을 넘기면 파싱 전에 막는다', async () => {
    const store = createMemoryStore(() => 1_000)
    const { mutate, calls } = harness({
      rateLimit: { limit: 1, windowMs: 60_000 },
      deps: {
        resolveSession: okSession,
        store,
        revalidatePath: () => undefined,
      },
    })

    expect(await mutate({ amount: 1 })).toMatchObject({ ok: true })
    const second = await mutate({ amount: 1 })

    expect(second).toMatchObject({ ok: false, code: 'RATE_LIMITED', status: 429 })
    // 두 번째 호출에서는 parse 가 늘지 않았어야 한다.
    expect(calls.filter((c) => c === 'parse')).toHaveLength(1)
  })

  it('도메인 에러를 매핑하고 재검증하지 않는다', async () => {
    const { mutate, revalidated } = harness({
      run: async () => {
        throw { name: 'ServiceError', code: 'INSUFFICIENT_MONEY', details: { need: 500n } }
      },
    })

    const result = await mutate({ amount: 1 })

    expect(result).toMatchObject({
      ok: false,
      code: 'INSUFFICIENT_MONEY',
      status: 400,
      messageKey: 'game.errors.INSUFFICIENT_MONEY',
      params: { need: '500' },
    })
    expect(revalidated).toEqual([])
  })

  it('예상치 못한 예외도 reject 하지 않고 INTERNAL 로 돌려준다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { mutate } = harness({
      run: async () => {
        throw new Error('연결 문자열: postgres://user:pw@host')
      },
    })

    const result = await mutate({ amount: 1 })

    expect(result).toMatchObject({ ok: false, code: 'INTERNAL', status: 500 })
    expect(JSON.stringify(result)).not.toContain('postgres://')
    spy.mockRestore()
  })
})
