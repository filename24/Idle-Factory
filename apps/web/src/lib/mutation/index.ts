/**
 * 게임 뮤테이션 인프라 배럴.
 *
 * 기능 시스템(공장·토지·퀘스트·길드 설정)은 이 모듈만 import 하면 된다.
 * 개별 파일을 직접 참조하면 실행 순서를 우회하는 조합이 만들어질 수 있다 —
 * 쓰기는 반드시 {@link defineGameMutation} 을 통과해야 한다.
 */

export { defineGameMutation } from './define'
export type { GameMutationContext, GameMutationDeps, GameMutationOptions } from './define'

export { isServiceError, mapServiceError, extractParams, SERVICE_ERROR_MAP } from './errors'
export type { ServiceErrorLike } from './errors'

export {
  assertResourceOwner,
  assertAllResourceOwners,
  ownershipClient,
  OWNER_FIELD,
} from './ownership'
export type {
  OwnedResource,
  OwnershipClient,
  OwnershipDelegate,
  OwnershipRequirement,
} from './ownership'

export { checkRateLimit, createMemoryStore, createRedisStore } from './rate-limit'
export type { RateLimitRule, RateLimitStore, RateLimitVerdict, RedisLike } from './rate-limit'

export { infraFail, mutationFail, mutationOk, INFRA_ERROR_MAP } from './result'
export type { InfraErrorCode, MutationFailure, MutationResult, MutationSuccess } from './result'

export { isMutationFailure, requireGameUser } from './session'
export type { GameSession, RequireGameUserOptions } from './session'
