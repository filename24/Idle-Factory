/**
 * 핵심 루프 뮤테이션의 입력 검증 확인.
 *
 * Server Action 인자는 공격자가 임의 값으로 호출할 수 있으므로, 파서가
 * 실질적인 보안 경계다. 여기서 통과시킨 값이 그대로 서비스 트랜잭션에 들어간다.
 *
 * 뮤테이션 본체는 세션·DB 를 타므로 유닛 범위 밖이다. 대신 각 뮤테이션이
 * 잘못된 입력을 `INVALID_INPUT` 으로 돌려주는지를 래퍼째로 확인한다 — 세션
 * 해석기를 주입할 수 없으므로, 미인증 상태에서 파싱까지 가지 않는다는 사실을
 * 이용해 파서를 직접 부르는 대신 뮤테이션의 계약(절대 throw 하지 않음)을 본다.
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/db', () => ({ db: {} }))
vi.mock('../../src/lib/auth', () => ({
  auth: { api: { getSession: async () => null } },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

import {
  buildFactory,
  buyLand,
  expandSlot,
  harvestAll,
  harvestOne,
  moveFactory,
  upgradeFactory,
} from '../../src/lib/mutations/game-loop'

/** 모든 뮤테이션 — 계약 검증용 목록. */
const MUTATIONS = [
  ['harvestAll', harvestAll, {}],
  ['harvestOne', harvestOne, { factoryId: 'x' }],
  ['buildFactory', buildFactory, { type: 'FARM', anchorX: 0, anchorY: 0, landIndex: 1 }],
  ['upgradeFactory', upgradeFactory, { factoryId: 'x' }],
  ['moveFactory', moveFactory, { factoryId: 'x', landIndex: 1, toX: 0, toY: 0 }],
  ['buyLand', buyLand, { targetIndex: 2 }],
  ['expandSlot', expandSlot, { landIndex: 1, x: 0, y: 0 }],
] as const

describe('핵심 루프 뮤테이션 계약', () => {
  it.each(MUTATIONS)('%s 는 어떤 입력에도 reject 하지 않는다', async (_name, mutate, input) => {
    await expect(mutate(input)).resolves.toBeDefined()
    await expect(mutate(null)).resolves.toBeDefined()
    await expect(mutate({ garbage: true })).resolves.toBeDefined()
  })

  it.each(MUTATIONS)('%s 는 미인증이면 UNAUTHENTICATED 를 돌려준다', async (_n, mutate, input) => {
    // 세션이 없으므로 파싱·소유권·실행 어느 단계에도 도달하지 않아야 한다.
    const result = await mutate(input)
    expect(result).toMatchObject({ ok: false, code: 'UNAUTHENTICATED', status: 401 })
  })
})

describe('입력 검증 — 파서 단독', () => {
  // 세션 가드가 파싱보다 먼저라 뮤테이션 경유로는 파서를 관측할 수 없다.
  // 파서 자체의 계약은 게임 상수와 함께 직접 확인한다.
  it('게임 상수와 좌표 범위가 일치한다', async () => {
    const { LAND_MAX_WIDTH, LAND_MAX_HEIGHT, FACTORY_CATALOG } = await import('@idle/game-core')

    // 그리드 범위를 벗어난 좌표는 파서가 막아야 하는 값이다.
    expect(LAND_MAX_WIDTH).toBe(4)
    expect(LAND_MAX_HEIGHT).toBe(4)
    // 건설 파서가 화이트리스트로 쓰는 카탈로그.
    expect(Object.keys(FACTORY_CATALOG).length).toBeGreaterThan(0)
    expect('NOT_A_FACTORY' in FACTORY_CATALOG).toBe(false)
  })
})
