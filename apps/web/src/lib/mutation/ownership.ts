/**
 * 리소스 소유권 가드 — 봇 `assertInteractionOwner` 의 웹 대응물.
 *
 * ## 두 표면이 지키는 것이 다르다
 *
 * 봇은 customId 가 공격자에게 그대로 보이므로, 남의 버튼을 눌러 그 사람의
 * 인터랙션을 조작하는 걸 막아야 한다(`utils/interactionOwner.ts`).
 * 웹은 다르다 — 신원을 **세션에서 유도**하고 클라이언트가 보낸 userId 는
 * 애초에 받지 않는다. 여기서 막아야 하는 건 "내 세션으로 **남의 행 id** 를
 * 보내는" 경우다.
 *
 * ## 이 검사는 권위가 아니라 심층 방어다
 *
 * 여기 조회는 트랜잭션 **밖**에서 일어나므로 TOCTOU 창이 있다. 권위 있는 검사는
 * 여전히 서비스 트랜잭션 내부(`factory.ts` 의 `factory.userId !== userId` 등)에
 * 있다. 이 가드의 값어치는 (1) 비싼 트랜잭션을 열기 전에 빠르게 실패하고,
 * (2) 서비스가 소유권 검사를 빠뜨렸을 때의 2차 방어선이라는 점이다.
 * **서비스 쪽 검사를 "가드가 이미 했으니" 이유로 제거하지 말 것.**
 */

import type { DatabaseClient } from '@idle/database'
import { infraFail, type MutationFailure } from './result'

/** 소유권 검사를 지원하는 리소스. */
export type OwnedResource = 'land' | 'factory' | 'warehouse' | 'marketListing' | 'stockHolding'

/**
 * 리소스별 소유자 컬럼.
 *
 * `MarketListing` 만 `sellerId` 를 쓴다(`schema.prisma` 의 `MarketListing.sellerId`).
 * 나머지는 전부 `userId` 다. 이 예외를 놓치면 매물 소유권 검사가 조용히
 * 통과해 버리므로 테이블로 명시한다.
 */
export const OWNER_FIELD: Readonly<Record<OwnedResource, 'userId' | 'sellerId'>> = {
  land: 'userId',
  factory: 'userId',
  warehouse: 'userId',
  marketListing: 'sellerId',
  stockHolding: 'userId',
} as const

/** 검사할 리소스 한 건. */
export interface OwnershipRequirement {
  readonly resource: OwnedResource
  readonly id: string
}

/** 소유권 조회에 필요한 최소 Prisma 형태 — 테스트에서 스텁을 끼우기 위한 구조. */
export type OwnershipDelegate = {
  findUnique(args: {
    where: { id: string }
    select: Record<string, boolean>
  }): Promise<Record<string, unknown> | null>
}

/** 소유권 조회에 쓰는 클라이언트 형태. */
export type OwnershipClient = Readonly<Record<OwnedResource, OwnershipDelegate>>

/**
 * 리소스가 해당 유저의 것인지 확인한다.
 *
 * 행이 **없을 때도** `FORBIDDEN_RESOURCE` 를 돌려준다 — 404 와 403 을 구분하면
 * "그 id 는 존재한다"는 정보가 새어 나가 열거 공격의 신호가 된다.
 *
 * @param client Prisma 클라이언트(또는 동형 스텁)
 * @param requirement 검사할 리소스
 * @param gameUserId 세션에서 유도한 게임 User.id
 * @returns 통과하면 `null`, 아니면 실패
 */
export async function assertResourceOwner(
  client: OwnershipClient,
  requirement: OwnershipRequirement,
  gameUserId: string,
): Promise<MutationFailure | null> {
  const ownerField = OWNER_FIELD[requirement.resource]
  const delegate = client[requirement.resource]
  if (!delegate) return infraFail('FORBIDDEN_RESOURCE')

  const row = await delegate.findUnique({
    where: { id: requirement.id },
    select: { [ownerField]: true },
  })

  if (!row || row[ownerField] !== gameUserId) return infraFail('FORBIDDEN_RESOURCE')
  return null
}

/**
 * 여러 리소스의 소유권을 한 번에 확인한다.
 *
 * 하나라도 실패하면 즉시 그 실패를 돌려준다.
 *
 * @param client Prisma 클라이언트(또는 동형 스텁)
 * @param requirements 검사할 리소스 목록
 * @param gameUserId 세션에서 유도한 게임 User.id
 * @returns 전부 통과하면 `null`, 아니면 첫 실패
 */
export async function assertAllResourceOwners(
  client: OwnershipClient,
  requirements: readonly OwnershipRequirement[],
  gameUserId: string,
): Promise<MutationFailure | null> {
  for (const requirement of requirements) {
    const failure = await assertResourceOwner(client, requirement, gameUserId)
    if (failure) return failure
  }
  return null
}

/** 실제 Prisma 클라이언트를 소유권 조회 형태로 좁힌다. */
export function ownershipClient(db: DatabaseClient): OwnershipClient {
  return db as unknown as OwnershipClient
}
