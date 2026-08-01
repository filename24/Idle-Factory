/**
 * 소유권 가드와 레이트 리밋 검증.
 *
 * 두 가지가 회귀하면 안 된다:
 *  - 행이 없을 때 404 가 아니라 403 을 준다(존재 여부 유출 방지).
 *  - `MarketListing` 만 `sellerId` 를 소유자 컬럼으로 쓴다.
 */

import { describe, expect, it } from 'vitest'
import {
  OWNER_FIELD,
  assertAllResourceOwners,
  assertResourceOwner,
  type OwnedResource,
  type OwnershipClient,
} from '../../src/lib/mutation/ownership'
import { checkRateLimit, createMemoryStore } from '../../src/lib/mutation/rate-limit'

const OWNER = 'owner-1'
const INTRUDER = 'intruder-9'

/** 지정한 행만 존재하는 최소 Prisma 스텁. */
function stubClient(rows: Partial<Record<OwnedResource, Record<string, unknown> | null>>) {
  const seen: { resource: OwnedResource; select: Record<string, boolean> }[] = []

  const client = Object.fromEntries(
    (Object.keys(OWNER_FIELD) as OwnedResource[]).map((resource) => [
      resource,
      {
        findUnique: async (args: { select: Record<string, boolean> }) => {
          seen.push({ resource, select: args.select })
          return rows[resource] ?? null
        },
      },
    ]),
  ) as unknown as OwnershipClient

  return { client, seen }
}

describe('OWNER_FIELD', () => {
  it('MarketListing 만 sellerId 를 쓴다', () => {
    // 이 예외를 놓치면 매물 소유권 검사가 undefined 비교로 조용히 통과한다.
    expect(OWNER_FIELD.marketListing).toBe('sellerId')
    expect(OWNER_FIELD.land).toBe('userId')
    expect(OWNER_FIELD.factory).toBe('userId')
    expect(OWNER_FIELD.warehouse).toBe('userId')
    expect(OWNER_FIELD.stockHolding).toBe('userId')
  })
})

describe('assertResourceOwner', () => {
  it('소유자면 통과시킨다', async () => {
    const { client } = stubClient({ factory: { userId: OWNER } })
    const result = await assertResourceOwner(client, { resource: 'factory', id: 'f1' }, OWNER)
    expect(result).toBeNull()
  })

  it('남의 리소스는 403 으로 막는다', async () => {
    const { client } = stubClient({ factory: { userId: OWNER } })
    const result = await assertResourceOwner(client, { resource: 'factory', id: 'f1' }, INTRUDER)
    expect(result?.code).toBe('FORBIDDEN_RESOURCE')
    expect(result?.status).toBe(403)
  })

  it('행이 없어도 404 가 아니라 403 을 준다', async () => {
    // 404 를 주면 "그 id 는 존재한다"가 새어 나가 열거 공격의 신호가 된다.
    const { client } = stubClient({ factory: null })
    const result = await assertResourceOwner(client, { resource: 'factory', id: 'ghost' }, OWNER)
    expect(result?.code).toBe('FORBIDDEN_RESOURCE')
    expect(result?.status).toBe(403)
  })

  it('매물은 sellerId 컬럼으로 조회한다', async () => {
    const { client, seen } = stubClient({ marketListing: { sellerId: OWNER } })
    const result = await assertResourceOwner(client, { resource: 'marketListing', id: 'l1' }, OWNER)
    expect(result).toBeNull()
    expect(seen[0]?.select).toEqual({ sellerId: true })
  })

  it('userId 컬럼을 가진 매물 행은 소유자로 인정하지 않는다', async () => {
    // sellerId 대신 userId 를 보도록 회귀하면 이 케이스가 잡아낸다.
    const { client } = stubClient({ marketListing: { userId: OWNER } })
    const result = await assertResourceOwner(client, { resource: 'marketListing', id: 'l1' }, OWNER)
    expect(result?.code).toBe('FORBIDDEN_RESOURCE')
  })
})

describe('assertAllResourceOwners', () => {
  it('전부 소유자면 통과시킨다', async () => {
    const { client } = stubClient({ land: { userId: OWNER }, factory: { userId: OWNER } })
    const result = await assertAllResourceOwners(
      client,
      [
        { resource: 'land', id: 'l1' },
        { resource: 'factory', id: 'f1' },
      ],
      OWNER,
    )
    expect(result).toBeNull()
  })

  it('하나라도 실패하면 즉시 멈춘다', async () => {
    const { client, seen } = stubClient({ land: null, factory: { userId: OWNER } })
    const result = await assertAllResourceOwners(
      client,
      [
        { resource: 'land', id: 'l1' },
        { resource: 'factory', id: 'f1' },
      ],
      OWNER,
    )
    expect(result?.code).toBe('FORBIDDEN_RESOURCE')
    // 첫 실패에서 멈췄으므로 두 번째 조회는 일어나지 않는다.
    expect(seen).toHaveLength(1)
  })
})

describe('checkRateLimit', () => {
  const rule = { bucket: 'land.buy', limit: 3, windowMs: 60_000 }

  it('한도까지 허용하고 초과분을 막는다', async () => {
    const store = createMemoryStore(() => 1_000)

    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit(rule, 'u1', store)).allowed, `호출 ${i + 1}`).toBe(true)
    }
    expect((await checkRateLimit(rule, 'u1', store)).allowed).toBe(false)
  })

  it('남은 횟수를 알려 주고 음수로 내려가지 않는다', async () => {
    const store = createMemoryStore(() => 1_000)

    expect((await checkRateLimit(rule, 'u1', store)).remaining).toBe(2)
    await checkRateLimit(rule, 'u1', store)
    await checkRateLimit(rule, 'u1', store)
    expect((await checkRateLimit(rule, 'u1', store)).remaining).toBe(0)
    expect((await checkRateLimit(rule, 'u1', store)).remaining).toBe(0)
  })

  it('윈도가 지나면 다시 허용한다', async () => {
    let now = 1_000
    const store = createMemoryStore(() => now)

    for (let i = 0; i < 3; i += 1) await checkRateLimit(rule, 'u1', store)
    expect((await checkRateLimit(rule, 'u1', store)).allowed).toBe(false)

    now += 60_001
    expect((await checkRateLimit(rule, 'u1', store)).allowed).toBe(true)
  })

  it('주체가 다르면 카운터가 독립이다', async () => {
    const store = createMemoryStore(() => 1_000)

    for (let i = 0; i < 3; i += 1) await checkRateLimit(rule, 'u1', store)
    expect((await checkRateLimit(rule, 'u1', store)).allowed).toBe(false)
    expect((await checkRateLimit(rule, 'u2', store)).allowed).toBe(true)
  })

  it('버킷이 다르면 카운터가 독립이다', async () => {
    const store = createMemoryStore(() => 1_000)

    for (let i = 0; i < 3; i += 1) await checkRateLimit(rule, 'u1', store)
    expect((await checkRateLimit(rule, 'u1', store)).allowed).toBe(false)
    expect((await checkRateLimit({ ...rule, bucket: 'factory.build' }, 'u1', store)).allowed).toBe(
      true,
    )
  })
})
