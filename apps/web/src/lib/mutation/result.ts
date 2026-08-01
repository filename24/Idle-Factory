/**
 * 뮤테이션 결과 봉투.
 *
 * ## 왜 throw 가 아니라 값으로 돌려주는가
 *
 * Next.js 는 프로덕션 빌드에서 Server Action 이 던진 예외를 **마스킹한다**.
 * 그대로 두면 `INSUFFICIENT_MONEY`("잔액이 부족합니다") 같은 정상적인 도메인
 * 실패가 유저에게 "An error occurred in the Server Components render" 로
 * 도달한다. 또 `useActionState` 는 액션의 **반환값**을 상태로 받으므로,
 * `forbidden()`·`unauthorized()` 처럼 throw 하는 Next 헬퍼는 그 훅과 함께 쓸 수 없다.
 *
 * 그래서 이 계층의 규칙은 하나다 — **뮤테이션은 절대 throw 하지 않는다.**
 * 예상 가능한 실패는 전부 `MutationFailure` 로 내려간다.
 *
 * 모양은 기존 읽기 API 의 `ApiEnvelope`(`src/app/api/_lib/http.ts`)와 맞췄다.
 * 나중에 Route Handler 로 같은 뮤테이션을 노출할 때 재매핑이 필요 없도록
 * `status`(HTTP 상태)를 실패 쪽에 함께 싣는다.
 */

import type { ServiceErrorCode } from '@idle/game-services'

/**
 * 인프라 계층 실패 코드.
 *
 * 도메인 실패({@link ServiceErrorCode})와 네임스페이스가 겹치지 않게 골랐다 —
 * 둘을 한 유니온에 합쳐도 어느 쪽에서 왔는지 코드만 보고 구분할 수 있어야 한다.
 */
export type InfraErrorCode =
  /** 로그인 세션이 없다. */
  | 'UNAUTHENTICATED'
  /** 로그인은 했지만 연결된 게임 계정이 없다(디스코드에서 게임 미시작). */
  | 'NO_GAME_ACCOUNT'
  /** 약관·개인정보 동의 전이다. 봇의 온보딩 게이트와 동일 정책. */
  | 'CONSENT_REQUIRED'
  /** 요청한 리소스의 소유자가 아니다. */
  | 'FORBIDDEN_RESOURCE'
  /** 레이트 리밋 초과. */
  | 'RATE_LIMITED'
  /** 입력 검증 실패. */
  | 'INVALID_INPUT'
  /** 예상하지 못한 내부 오류. 원문은 서버 로그에만 남긴다. */
  | 'INTERNAL'

/** 뮤테이션 실패. */
export interface MutationFailure {
  readonly ok: false
  readonly code: ServiceErrorCode | InfraErrorCode
  /** Route Handler 로 재노출할 때 쓰는 HTTP 상태. Server Action 에서는 참고값. */
  readonly status: number
  /**
   * next-intl 메시지 키. 번역은 호출 측(서버 컴포넌트 또는 클라이언트 섬)에서
   * 한다 — 이 계층은 로케일을 모르고, 알 필요도 없다.
   */
  readonly messageKey: string
  /** 메시지 placeholder 값. `ServiceError.details` 에서 스칼라만 추린 것. */
  readonly params?: Readonly<Record<string, string | number>>
}

/** 뮤테이션 성공. */
export interface MutationSuccess<T> {
  readonly ok: true
  readonly data: T
}

/** 뮤테이션 결과 — 성공/실패 판별 유니온. */
export type MutationResult<T> = MutationSuccess<T> | MutationFailure

/**
 * 성공 결과를 만든다.
 *
 * @param data 클라이언트로 내려갈 페이로드. 이미 직렬화된 값이어야 한다.
 */
export function mutationOk<T>(data: T): MutationSuccess<T> {
  return { ok: true, data }
}

/**
 * 실패 결과를 만든다.
 *
 * @param code 실패 코드
 * @param status HTTP 상태
 * @param messageKey next-intl 메시지 키
 * @param params 메시지 placeholder 값
 */
export function mutationFail(
  code: ServiceErrorCode | InfraErrorCode,
  status: number,
  messageKey: string,
  params?: Readonly<Record<string, string | number>>,
): MutationFailure {
  return params
    ? { ok: false, code, status, messageKey, params }
    : { ok: false, code, status, messageKey }
}

/** 인프라 실패 코드 → HTTP 상태·메시지 키. */
export const INFRA_ERROR_MAP: Readonly<
  Record<InfraErrorCode, { readonly status: number; readonly messageKey: string }>
> = {
  UNAUTHENTICATED: { status: 401, messageKey: 'mutation.errors.UNAUTHENTICATED' },
  NO_GAME_ACCOUNT: { status: 403, messageKey: 'mutation.errors.NO_GAME_ACCOUNT' },
  CONSENT_REQUIRED: { status: 403, messageKey: 'mutation.errors.CONSENT_REQUIRED' },
  FORBIDDEN_RESOURCE: { status: 403, messageKey: 'mutation.errors.FORBIDDEN_RESOURCE' },
  RATE_LIMITED: { status: 429, messageKey: 'mutation.errors.RATE_LIMITED' },
  INVALID_INPUT: { status: 400, messageKey: 'mutation.errors.INVALID_INPUT' },
  INTERNAL: { status: 500, messageKey: 'mutation.errors.INTERNAL' },
} as const

/**
 * 인프라 실패를 코드만으로 만든다.
 *
 * @param code 인프라 실패 코드
 * @param params 메시지 placeholder 값
 */
export function infraFail(
  code: InfraErrorCode,
  params?: Readonly<Record<string, string | number>>,
): MutationFailure {
  const entry = INFRA_ERROR_MAP[code]
  return mutationFail(code, entry.status, entry.messageKey, params)
}
