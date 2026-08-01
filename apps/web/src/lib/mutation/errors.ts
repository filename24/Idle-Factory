/**
 * `ServiceError` → HTTP 상태 + i18n 메시지 키 매핑.
 *
 * ## instanceof 를 쓰지 않는 이유
 *
 * `@idle/game-services` 의 `base.ts` 가 스스로 문서화하듯, tsup 번들링과
 * 모노레포 중복 설치로 클래스 신원(realm)이 깨질 수 있다. 봇의 기존 매퍼들은
 * `instanceof` 를 쓰지만 그건 같은 번들 안에 있어서 우연히 동작할 뿐이다.
 * 웹은 워크스페이스 패키지 경계를 넘어 import 하므로 구조 판정을 쓴다.
 *
 * ## 왜 `Partial` 이 아니라 완전한 `Record` 인가
 *
 * {@link SERVICE_ERROR_MAP} 을 `Record<ServiceErrorCode, …>` 로 못 박으면,
 * `base.ts` 에 새 코드가 추가되는 순간 `pnpm --filter web typecheck` 가 깨진다.
 * 이게 봇과 웹의 에러 목록이 조용히 어긋나지 않게 하는 유일한 기계적 장치다 —
 * 봇 쪽 `i18n-sync` 규율의 웹 대응물이라고 보면 된다. 절대 `Partial` 로
 * 완화하지 말 것.
 */

import type { ServiceErrorCode } from '@idle/game-services'
import { mutationFail, infraFail, type MutationFailure } from './result'

/** 구조 판정용 최소 형태 — 실제 클래스가 아니라 모양만 본다. */
export interface ServiceErrorLike {
  readonly name: 'ServiceError'
  readonly code: ServiceErrorCode
  readonly message?: string
  readonly details?: unknown
}

/**
 * 값이 `ServiceError` 인지 구조로 판정한다.
 *
 * 번들 realm 이 갈려도 동작하도록 `instanceof` 대신 `name`·`code` 를 본다.
 *
 * @param err 판정할 값
 */
export function isServiceError(err: unknown): err is ServiceErrorLike {
  if (err === null || typeof err !== 'object') return false
  const candidate = err as { name?: unknown; code?: unknown }
  return candidate.name === 'ServiceError' && typeof candidate.code === 'string'
}

/** HTTP 상태 상수 — 매핑 테이블의 가독성을 위해 이름을 붙인다. */
const BAD_REQUEST = 400
const FORBIDDEN = 403
const NOT_FOUND = 404
const CONFLICT = 409
const TOO_MANY_REQUESTS = 429

/**
 * 도메인 실패 코드 전수 매핑.
 *
 * 상태 코드 배분 원칙:
 *  - 404 — 대상이 없다(또는 없는 것처럼 보여야 한다).
 *  - 403 — 대상은 있으나 자격이 없다(레벨·신뢰도·소유권).
 *  - 409 — 현재 상태와 충돌한다(이미 최대, 이미 점유, 이미 수령).
 *  - 429 — 속도·횟수 제한.
 *  - 400 — 입력이 잘못됐다.
 */
export const SERVICE_ERROR_MAP: Readonly<
  Record<ServiceErrorCode, { readonly status: number; readonly messageKey: string }>
> = {
  // 계정
  USER_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.USER_NOT_FOUND' },

  // 자원
  INSUFFICIENT_MONEY: { status: BAD_REQUEST, messageKey: 'game.errors.INSUFFICIENT_MONEY' },
  INSUFFICIENT_MATERIAL: { status: BAD_REQUEST, messageKey: 'game.errors.INSUFFICIENT_MATERIAL' },
  WAREHOUSE_FULL: { status: CONFLICT, messageKey: 'game.errors.WAREHOUSE_FULL' },

  // 슬롯·배치
  SLOT_OCCUPIED: { status: CONFLICT, messageKey: 'game.errors.SLOT_OCCUPIED' },
  SLOT_LOCKED: { status: FORBIDDEN, messageKey: 'game.errors.SLOT_LOCKED' },
  SLOT_ALREADY_UNLOCKED: { status: CONFLICT, messageKey: 'game.errors.SLOT_ALREADY_UNLOCKED' },
  OUT_OF_BOUNDS: { status: BAD_REQUEST, messageKey: 'game.errors.OUT_OF_BOUNDS' },

  // 공장
  FACTORY_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.FACTORY_NOT_FOUND' },
  FACTORY_LISTED: { status: CONFLICT, messageKey: 'game.errors.FACTORY_LISTED' },
  LEVEL_LOCKED: { status: FORBIDDEN, messageKey: 'game.errors.LEVEL_LOCKED' },
  MAX_GRADE: { status: CONFLICT, messageKey: 'game.errors.MAX_GRADE' },
  CREDIT_RESTRICTED: { status: FORBIDDEN, messageKey: 'game.errors.CREDIT_RESTRICTED' },
  BOOSTER_NOT_AVAILABLE: { status: CONFLICT, messageKey: 'game.errors.BOOSTER_NOT_AVAILABLE' },
  RAW_BOOSTER_ALREADY_APPLIED: {
    status: CONFLICT,
    messageKey: 'game.errors.RAW_BOOSTER_ALREADY_APPLIED',
  },

  // 토지
  MAX_LANDS: { status: CONFLICT, messageKey: 'game.errors.MAX_LANDS' },
  LAND_ALREADY_EXISTS: { status: CONFLICT, messageKey: 'game.errors.LAND_ALREADY_EXISTS' },
  INVALID_LAND_INDEX: { status: BAD_REQUEST, messageKey: 'game.errors.INVALID_LAND_INDEX' },
  LAND_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.LAND_NOT_FOUND' },
  MOVE_SAME_POSITION: { status: CONFLICT, messageKey: 'game.errors.MOVE_SAME_POSITION' },

  // 퀘스트
  QUEST_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.QUEST_NOT_FOUND' },
  QUEST_NOT_COMPLETED: { status: CONFLICT, messageKey: 'game.errors.QUEST_NOT_COMPLETED' },
  QUEST_ALREADY_CLAIMED: { status: CONFLICT, messageKey: 'game.errors.QUEST_ALREADY_CLAIMED' },

  // 마켓 — 입력
  INVALID_QUANTITY: { status: BAD_REQUEST, messageKey: 'game.errors.INVALID_QUANTITY' },
  INVALID_PRICE: { status: BAD_REQUEST, messageKey: 'game.errors.INVALID_PRICE' },
  INVALID_DURATION: { status: BAD_REQUEST, messageKey: 'game.errors.INVALID_DURATION' },
  PRICE_OUT_OF_RANGE: { status: BAD_REQUEST, messageKey: 'game.errors.PRICE_OUT_OF_RANGE' },

  // 마켓 — 매물
  LISTING_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.LISTING_NOT_FOUND' },
  LISTING_NOT_ACTIVE: { status: CONFLICT, messageKey: 'game.errors.LISTING_NOT_ACTIVE' },
  // 남의 매물임을 알려 주는 대신 소유권 부재로 처리한다.
  NOT_LISTING_OWNER: { status: FORBIDDEN, messageKey: 'game.errors.NOT_LISTING_OWNER' },
  SELF_PURCHASE: { status: CONFLICT, messageKey: 'game.errors.SELF_PURCHASE' },
  PRICE_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.PRICE_NOT_FOUND' },
  MATERIAL_NOT_DIRECT_BUYABLE: {
    status: BAD_REQUEST,
    messageKey: 'game.errors.MATERIAL_NOT_DIRECT_BUYABLE',
  },
  DAILY_LIMIT_EXCEEDED: {
    status: TOO_MANY_REQUESTS,
    messageKey: 'game.errors.DAILY_LIMIT_EXCEEDED',
  },
  CREDIT_LISTING_BLOCKED: { status: FORBIDDEN, messageKey: 'game.errors.CREDIT_LISTING_BLOCKED' },

  // 주식
  STOCK_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.STOCK_NOT_FOUND' },
  STOCK_SELF_TRADE: { status: CONFLICT, messageKey: 'game.errors.STOCK_SELF_TRADE' },
  STOCK_INSUFFICIENT_SHARES: {
    status: BAD_REQUEST,
    messageKey: 'game.errors.STOCK_INSUFFICIENT_SHARES',
  },
  STOCK_LISTING_CONDITION_NOT_MET: {
    status: FORBIDDEN,
    messageKey: 'game.errors.STOCK_LISTING_CONDITION_NOT_MET',
  },
  STOCK_ALREADY_LISTED: { status: CONFLICT, messageKey: 'game.errors.STOCK_ALREADY_LISTED' },
  STOCK_FLOAT_EXHAUSTED: { status: CONFLICT, messageKey: 'game.errors.STOCK_FLOAT_EXHAUSTED' },
  STOCK_RATE_LIMITED: { status: TOO_MANY_REQUESTS, messageKey: 'game.errors.STOCK_RATE_LIMITED' },
  STOCK_IPO_PRICE_OUT_OF_RANGE: {
    status: BAD_REQUEST,
    messageKey: 'game.errors.STOCK_IPO_PRICE_OUT_OF_RANGE',
  },
  STOCK_LEVEL_GATE: { status: FORBIDDEN, messageKey: 'game.errors.STOCK_LEVEL_GATE' },

  // 길드·운영
  GUILD_NOT_FOUND: { status: NOT_FOUND, messageKey: 'game.errors.GUILD_NOT_FOUND' },
  INVALID_CREDIT_VALUE: { status: BAD_REQUEST, messageKey: 'game.errors.INVALID_CREDIT_VALUE' },
  AUDIT_REASON_REQUIRED: { status: BAD_REQUEST, messageKey: 'game.errors.AUDIT_REASON_REQUIRED' },
  UNSUPPORTED_LANGUAGE: { status: BAD_REQUEST, messageKey: 'game.errors.UNSUPPORTED_LANGUAGE' },
} as const

/**
 * `ServiceError.details` 에서 메시지 placeholder 로 쓸 수 있는 스칼라만 추린다.
 *
 * 객체·함수·심볼은 버린다 — next-intl 로 넘어가면 렌더 시점에 터지고,
 * 무엇보다 서비스 내부 구조가 유저 화면에 새어 나갈 수 있다.
 * `bigint` 는 문자열로 바꾼다(금액이 흔히 들어온다).
 *
 * @param details `ServiceError` 의 details
 * @returns placeholder 맵. 쓸 값이 없으면 undefined.
 */
export function extractParams(
  details: unknown,
): Readonly<Record<string, string | number>> | undefined {
  if (details === null || typeof details !== 'object' || Array.isArray(details)) return undefined

  const params: Record<string, string | number> = {}
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' || typeof value === 'number') {
      params[key] = value
    } else if (typeof value === 'bigint') {
      params[key] = value.toString()
    }
  }
  return Object.keys(params).length > 0 ? params : undefined
}

/**
 * 임의의 에러를 {@link MutationFailure} 로 정규화한다.
 *
 * `ServiceError` 가 아니면 `INTERNAL`(500)로 뭉갠다 — 원문 메시지는 유저에게
 * 노출하지 않는다. 호출 측에서 서버 로그에 남기는 것은 별개다.
 *
 * @param err 잡은 에러
 */
export function mapServiceError(err: unknown): MutationFailure {
  if (!isServiceError(err)) return infraFail('INTERNAL')

  const entry = SERVICE_ERROR_MAP[err.code]
  // 타입상 도달할 수 없지만, 런타임에 버전이 어긋난 패키지가 물릴 수 있다.
  if (!entry) return infraFail('INTERNAL')

  return mutationFail(err.code, entry.status, entry.messageKey, extractParams(err.details))
}
