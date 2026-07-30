/**
 * better-auth 인증 실패 코드 → 책임 소재·권장 행동 분류.
 *
 * better-auth 는 OAuth 흐름이 깨지면 `errorURL` 로 `?error=<코드>` 를 붙여
 * 리다이렉트한다. 기본 제공 페이지는 영문 HTML 이라 디자인 시스템 밖으로
 * 벗어나므로, 이 모듈이 코드를 분류하고 `/auth/error` 가 렌더한다.
 *
 * **표시 문구는 여기 없다.** 제목·설명은 `messages/<locale>.json` 의
 * `authError.<code>.title` / `.description` 이 단일 진실 소스다. 이 모듈은
 * 로케일에 무관한 사실(어느 쪽 책임인지, 다음에 뭘 해야 하는지)만 들고 있다.
 * 새 코드를 추가할 때는 분류와 두 로케일 메시지를 **함께** 넣어야 한다 —
 * `tests/unit/auth-errors.test.ts` 가 그 짝을 검증한다.
 *
 * 카탈로그는 추측이 아니라 설치된 better-auth 1.6.9 의 `redirectOnError(...)` ·
 * `?error=` 호출부를 전수 조사해 만들었다. 버전을 올릴 때는 아래 명령으로 다시
 * 확인할 것:
 *
 * ```
 * grep -rhoE 'redirectOnError\([^)]{0,90}|\?error=[a-z_0-9]+' node_modules/better-auth/dist
 * ```
 */

/** 전용 콘텐츠를 찾지 못했을 때 쓰는 폴백 코드. */
export const UNKNOWN_AUTH_ERROR_CODE = 'unknown'

/** 정규화된 코드의 최대 길이 — 쿼리스트링은 신뢰 불가 입력이라 상한을 둔다. */
const MAX_CODE_LENGTH = 64

/**
 * 에러의 책임 소재. 페이지가 안내 문구와 버튼을 고르는 기준이 된다.
 *
 * - `user`: 사용자 행동으로 발생했고 사용자가 해결할 수 있다.
 * - `config`: 서비스 설정이 잘못됐다. 사용자가 재시도해도 절대 풀리지 않는다.
 * - `server`: 일시적 서버·네트워크 장애. 잠시 후면 풀릴 수 있다.
 */
export type AuthErrorKind = 'user' | 'config' | 'server'

/**
 * 페이지가 제시할 다음 행동.
 *
 * - `retry`: 다시 로그인 시도.
 * - `home`: 홈으로 돌아가기(재시도가 의미 없을 때).
 * - `support`: 문의 안내(운영자 개입이 필요할 때).
 */
export type AuthErrorAction = 'retry' | 'home' | 'support'

/** 카탈로그 한 항목 — 코드 하나의 로케일 무관 분류. */
export interface AuthErrorEntry {
  /** 책임 소재. */
  kind: AuthErrorKind
  /** 권장 다음 행동. */
  action: AuthErrorAction
}

/** `resolveAuthError` 의 반환값 — 분류에 실제 코드와 매칭 여부를 더한 것. */
export interface ResolvedAuthError extends AuthErrorEntry {
  /** 정규화된 에러 코드. 매칭 실패해도 원본을 보존해 문의 단서로 쓴다. */
  code: string
  /** 카탈로그에서 전용 콘텐츠를 찾았는지 여부. */
  known: boolean
  /**
   * 메시지 조회에 쓸 코드. 카탈로그에 없으면 `unknown` 으로 떨어진다.
   * (`code` 는 원본 보존용이라 그대로 쓰면 키가 없어 렌더가 깨진다.)
   */
  messageCode: string
}

/**
 * better-auth 가 실제로 방출하는 에러 코드 카탈로그.
 *
 * 키는 정규화된 소문자 스네이크케이스 슬러그다. `normalizeAuthErrorCode` 를
 * 거친 값과 직접 대조되므로 새 항목도 반드시 같은 형식으로 넣을 것.
 */
export const AUTH_ERROR_CATALOG: Record<string, AuthErrorEntry> = {
  access_denied: { kind: 'user', action: 'retry' },
  invalid_request: { kind: 'user', action: 'retry' },
  invalid_scope: { kind: 'config', action: 'support' },
  unauthorized_client: { kind: 'config', action: 'support' },
  unsupported_response_type: { kind: 'config', action: 'support' },
  temporarily_unavailable: { kind: 'server', action: 'retry' },
  server_error: { kind: 'server', action: 'retry' },
  invalid_client: { kind: 'config', action: 'support' },
  client_disabled: { kind: 'config', action: 'support' },
  invalid_redirect_uri: { kind: 'config', action: 'support' },
  oauth_provider_not_found: { kind: 'config', action: 'support' },
  no_callback_url: { kind: 'config', action: 'support' },
  invalid_callback_request: { kind: 'user', action: 'retry' },
  no_code: { kind: 'user', action: 'retry' },
  invalid_code: { kind: 'user', action: 'retry' },
  oauth_code_verification_failed: { kind: 'user', action: 'retry' },
  state_mismatch: { kind: 'user', action: 'retry' },
  please_restart_the_process: { kind: 'user', action: 'retry' },
  payload_expired: { kind: 'user', action: 'retry' },
  invalid_payload: { kind: 'user', action: 'retry' },
  unable_to_get_user_info: { kind: 'server', action: 'retry' },
  user_info_is_missing: { kind: 'server', action: 'retry' },
  invalid_profile: { kind: 'server', action: 'support' },
  missing_profile: { kind: 'server', action: 'retry' },
  email_is_missing: { kind: 'user', action: 'retry' },
  email_not_found: { kind: 'user', action: 'retry' },
  name_is_missing: { kind: 'user', action: 'retry' },
  unable_to_link_account: { kind: 'server', action: 'retry' },
  account_already_linked_to_different_user: { kind: 'user', action: 'support' },
  email_doesnt_match: { kind: 'user', action: 'retry' },
  user_creation_failed: { kind: 'server', action: 'retry' },
  signup_disabled: { kind: 'config', action: 'home' },
  invalid_token: { kind: 'user', action: 'retry' },
  token_expired: { kind: 'user', action: 'retry' },
  invalid_user: { kind: 'user', action: 'retry' },
  user_not_found: { kind: 'user', action: 'retry' },
  banned: { kind: 'user', action: 'support' },
  internal_server_error: { kind: 'server', action: 'retry' },
  [UNKNOWN_AUTH_ERROR_CODE]: { kind: 'server', action: 'retry' },
}

/**
 * 쿼리스트링으로 들어온 에러 값을 카탈로그 조회용 슬러그로 정규화한다.
 *
 * better-auth 는 슬러그(`state_mismatch`)뿐 아니라 대문자 상수(`INVALID_TOKEN`)와
 * 사람이 읽는 문장(`User not found`)도 같은 자리에 넘긴다. 셋을 하나의 형태로
 * 모은다. 입력은 신뢰할 수 없으므로 영숫자·언더스코어만 남기고 길이도 제한한다.
 *
 * @param raw `?error=` 로 받은 원본 값(신뢰 불가)
 * @returns 소문자 스네이크케이스 슬러그. 남는 문자가 없으면 `unknown`
 */
export function normalizeAuthErrorCode(raw: string | undefined | null): string {
  if (!raw) return UNKNOWN_AUTH_ERROR_CODE

  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]+/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX_CODE_LENGTH)
    .replace(/_+$/, '')

  return slug || UNKNOWN_AUTH_ERROR_CODE
}

/**
 * 에러 코드를 화면에 바로 쓸 수 있는 분류로 해석한다.
 *
 * 카탈로그에 없는 코드여도 폴백 분류와 함께 **원본 코드를 보존**한다. 문의할 때
 * 사용자가 읽어줄 유일한 단서이기 때문이다. 표시 문구는 호출부가
 * `messageCode` 로 메시지 카탈로그에서 가져온다.
 *
 * @param raw `?error=` 로 받은 원본 값(신뢰 불가)
 */
export function resolveAuthError(raw: string | undefined | null): ResolvedAuthError {
  const code = normalizeAuthErrorCode(raw)
  const entry = code === UNKNOWN_AUTH_ERROR_CODE ? undefined : AUTH_ERROR_CATALOG[code]

  return {
    ...(entry ?? AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE]!),
    code,
    known: entry !== undefined,
    messageCode: entry !== undefined ? code : UNKNOWN_AUTH_ERROR_CODE,
  }
}
