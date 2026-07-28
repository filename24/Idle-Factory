/**
 * better-auth 인증 실패 코드 → 한국어 사용자 안내 매핑.
 *
 * better-auth 는 OAuth 흐름이 깨지면 `errorURL` 로 `?error=<코드>` 를 붙여
 * 리다이렉트한다. 기본 제공 페이지는 영문 HTML 이라 디자인 시스템 밖으로
 * 벗어나므로, 이 모듈이 코드를 우리 문구로 번역하고 `/auth/error` 가 렌더한다.
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

/** 카탈로그 한 항목 — 코드 하나에 대한 표시 콘텐츠와 분류. */
export interface AuthErrorEntry {
  /** 페이지 제목. */
  title: string
  /** 무슨 일이 일어났고 무엇을 하면 되는지 설명하는 한 문단. */
  description: string
  /** 책임 소재. */
  kind: AuthErrorKind
  /** 권장 다음 행동. */
  action: AuthErrorAction
}

/** `resolveAuthError` 의 반환값 — 카탈로그 항목에 실제 코드와 매칭 여부를 더한 것. */
export interface ResolvedAuthError extends AuthErrorEntry {
  /** 정규화된 에러 코드. 매칭 실패해도 원본을 보존해 문의 단서로 쓴다. */
  code: string
  /** 카탈로그에서 전용 콘텐츠를 찾았는지 여부. */
  known: boolean
}

const RETRY_HINT = '아래 버튼으로 다시 로그인해 주세요.'
const CONFIG_HINT = '사용자가 해결할 수 있는 문제가 아닙니다. 운영자에게 알려 주세요.'

/**
 * better-auth 가 실제로 방출하는 에러 코드 카탈로그.
 *
 * 키는 정규화된 소문자 스네이크케이스 슬러그다. `normalizeAuthErrorCode` 를
 * 거친 값과 직접 대조되므로 새 항목도 반드시 같은 형식으로 넣을 것.
 */
export const AUTH_ERROR_CATALOG: Record<string, AuthErrorEntry> = {
  // ── OAuth2 표준 코드 — Discord 가 콜백 쿼리로 그대로 전달한다 ──
  access_denied: {
    title: '로그인을 취소했습니다',
    description: `Discord 인증 화면에서 접근 권한을 거부했습니다. 계속하려면 권한을 허용해야 합니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  invalid_request: {
    title: '잘못된 로그인 요청입니다',
    description: `요청에 필요한 값이 빠졌거나 형식이 맞지 않습니다. 주소창의 링크를 직접 수정했다면 처음부터 다시 시작해 주세요. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  invalid_scope: {
    title: '요청한 권한 범위가 올바르지 않습니다',
    description: `서비스가 Discord 에 요청한 권한 범위가 유효하지 않습니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  unauthorized_client: {
    title: '이 애플리케이션은 로그인 권한이 없습니다',
    description: `Discord 애플리케이션이 이 방식의 로그인을 사용할 수 없도록 설정돼 있습니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  unsupported_response_type: {
    title: '지원하지 않는 인증 방식입니다',
    description: `서비스가 Discord 에 보낸 인증 요청 형식을 Discord 가 받아들이지 않았습니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  temporarily_unavailable: {
    title: 'Discord 가 일시적으로 응답하지 않습니다',
    description:
      'Discord 인증 서버가 잠시 과부하 상태이거나 점검 중입니다. 몇 분 뒤에 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  server_error: {
    title: 'Discord 쪽에서 오류가 발생했습니다',
    description:
      'Discord 인증 서버가 오류를 반환했습니다. 서비스 문제가 아니므로 잠시 후 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },

  // ── 자격증명·설정 오류 — 운영자만 고칠 수 있다 ──
  invalid_client: {
    title: '서비스의 Discord 자격증명이 올바르지 않습니다',
    description: `Discord 가 이 서비스의 클라이언트 ID 또는 시크릿을 거부했습니다. 자격증명이 만료됐거나 잘못 설정된 상태입니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  client_disabled: {
    title: '이 애플리케이션이 비활성화됐습니다',
    description: `Discord 애플리케이션이 사용 중지 상태입니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  invalid_redirect_uri: {
    title: '리다이렉트 주소가 등록돼 있지 않습니다',
    description: `로그인 후 돌아올 주소가 Discord 애플리케이션에 등록된 목록과 다릅니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  oauth_provider_not_found: {
    title: '로그인 제공자를 찾을 수 없습니다',
    description: `요청한 소셜 로그인 제공자가 서비스에 설정돼 있지 않습니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  no_callback_url: {
    title: '돌아올 주소가 지정되지 않았습니다',
    description: `로그인 완료 후 이동할 주소가 요청에 없습니다. ${CONFIG_HINT}`,
    kind: 'config',
    action: 'support',
  },
  invalid_callback_request: {
    title: '잘못된 콜백 요청입니다',
    description: `Discord 에서 돌아온 요청의 형식이 올바르지 않습니다. 처음부터 다시 로그인해 주세요. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },

  // ── 인가 코드 교환 단계 ──
  no_code: {
    title: '인증 코드가 전달되지 않았습니다',
    description: `Discord 가 인증 코드 없이 돌아왔습니다. 로그인 창을 중간에 닫았을 때 주로 발생합니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  invalid_code: {
    title: '인증 코드가 유효하지 않습니다',
    description: `인증 코드가 이미 사용됐거나 만료됐습니다. 뒤로가기나 새로고침으로 같은 링크를 다시 열면 발생합니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  oauth_code_verification_failed: {
    title: '인증 코드 검증에 실패했습니다',
    description: `보안 검증(PKCE) 값이 맞지 않습니다. 로그인을 시작한 브라우저와 완료한 브라우저가 다르면 발생합니다. 같은 브라우저에서 ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  state_mismatch: {
    title: '보안 검증에 실패했습니다',
    description: `요청 위조를 막는 state 값이 일치하지 않습니다. 쿠키가 차단됐거나 로그인 창을 너무 오래 열어 뒀을 때 발생합니다. 쿠키를 허용한 뒤 ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  please_restart_the_process: {
    title: '로그인을 처음부터 다시 시작해 주세요',
    description: `진행 중이던 인증 정보가 남아 있지 않습니다. 시간이 오래 지났거나 쿠키가 지워진 경우입니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  payload_expired: {
    title: '인증 요청이 만료됐습니다',
    description: `로그인 요청의 유효 시간이 지났습니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  invalid_payload: {
    title: '인증 데이터가 손상됐습니다',
    description: `Discord 에서 돌아온 인증 데이터를 해석할 수 없습니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },

  // ── 프로필 조회 단계 ──
  unable_to_get_user_info: {
    title: 'Discord 프로필을 가져오지 못했습니다',
    description:
      'Discord 에서 계정 정보를 읽는 데 실패했습니다. 잠시 후 다시 시도해도 같다면 문의해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  user_info_is_missing: {
    title: 'Discord 프로필이 비어 있습니다',
    description: 'Discord 가 계정 정보를 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  invalid_profile: {
    title: '프로필 형식을 해석할 수 없습니다',
    description: 'Discord 계정 정보의 형식이 예상과 다릅니다. 반복되면 문의해 주세요.',
    kind: 'server',
    action: 'support',
  },
  missing_profile: {
    title: '프로필 정보가 없습니다',
    description:
      'Discord 계정 정보를 받지 못해 가입을 진행할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  email_is_missing: {
    title: 'Discord 계정에 이메일이 없습니다',
    description:
      '가입에는 이메일이 필요합니다. Discord 계정 설정에서 이메일을 등록하고 인증한 뒤 다시 시도해 주세요.',
    kind: 'user',
    action: 'retry',
  },
  email_not_found: {
    title: '이메일을 확인할 수 없습니다',
    description:
      'Discord 계정에서 이메일을 가져오지 못했습니다. 이메일 인증을 마친 계정인지 확인한 뒤 다시 시도해 주세요.',
    kind: 'user',
    action: 'retry',
  },
  name_is_missing: {
    title: 'Discord 계정에 표시 이름이 없습니다',
    description: '가입에는 표시 이름이 필요합니다. Discord 프로필을 확인한 뒤 다시 시도해 주세요.',
    kind: 'user',
    action: 'retry',
  },

  // ── 계정 연결·생성 단계 ──
  unable_to_link_account: {
    title: '계정을 연결하지 못했습니다',
    description: 'Discord 계정을 기존 계정에 연결하는 데 실패했습니다. 잠시 후 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  account_already_linked_to_different_user: {
    title: '이미 다른 계정에 연결된 Discord 계정입니다',
    description:
      '이 Discord 계정은 다른 사용자에게 연결돼 있습니다. 본인 계정이 맞다면 기존 계정으로 로그인하거나 문의해 주세요.',
    kind: 'user',
    action: 'support',
  },
  email_doesnt_match: {
    title: '이메일이 일치하지 않습니다',
    description:
      '연결하려는 Discord 계정의 이메일이 로그인된 계정과 다릅니다. 같은 이메일을 쓰는 계정으로 다시 시도해 주세요.',
    kind: 'user',
    action: 'retry',
  },
  user_creation_failed: {
    title: '계정을 만들지 못했습니다',
    description:
      '새 계정을 생성하는 도중 오류가 발생했습니다. 잠시 후 다시 시도해도 같다면 문의해 주세요.',
    kind: 'server',
    action: 'retry',
  },
  signup_disabled: {
    title: '지금은 신규 가입을 받지 않습니다',
    description:
      '새 계정 생성이 중지된 상태입니다. 이미 계정이 있다면 기존 계정으로 로그인해 주세요.',
    kind: 'config',
    action: 'home',
  },

  // ── 세션·토큰 ──
  invalid_token: {
    title: '유효하지 않은 토큰입니다',
    description: `인증 토큰이 올바르지 않습니다. 링크가 변조됐거나 이미 사용된 경우입니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  token_expired: {
    title: '인증 링크가 만료됐습니다',
    description: `토큰의 유효 시간이 지났습니다. ${RETRY_HINT}`,
    kind: 'user',
    action: 'retry',
  },
  invalid_user: {
    title: '유효하지 않은 사용자입니다',
    description: '요청에 담긴 사용자를 확인할 수 없습니다. 다시 로그인한 뒤 시도해 주세요.',
    kind: 'user',
    action: 'retry',
  },
  user_not_found: {
    title: '사용자를 찾을 수 없습니다',
    description:
      '해당하는 계정이 존재하지 않습니다. 계정이 삭제됐을 수 있습니다. 새로 로그인해 주세요.',
    kind: 'user',
    action: 'retry',
  },
  banned: {
    title: '이용이 제한된 계정입니다',
    description:
      '이 계정은 서비스 이용이 정지됐습니다. 조치가 부당하다고 생각되면 운영자에게 문의해 주세요.',
    kind: 'user',
    action: 'support',
  },

  // ── 서버 ──
  internal_server_error: {
    title: '서버에서 오류가 발생했습니다',
    description: '로그인 처리 중 예기치 못한 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
    kind: 'server',
    action: 'retry',
  },

  // ── 폴백 ──
  [UNKNOWN_AUTH_ERROR_CODE]: {
    title: '로그인에 실패했습니다',
    description:
      '알 수 없는 이유로 인증이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요. 계속 같은 화면이 보이면 아래 코드와 함께 문의해 주세요.',
    kind: 'server',
    action: 'retry',
  },
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
 * 에러 코드를 화면에 바로 쓸 수 있는 콘텐츠로 해석한다.
 *
 * 카탈로그에 없는 코드여도 폴백 콘텐츠와 함께 **원본 코드를 보존**한다. 문의할 때
 * 사용자가 읽어줄 유일한 단서이기 때문이다.
 *
 * @param raw `?error=` 로 받은 원본 값(신뢰 불가)
 */
export function resolveAuthError(raw: string | undefined | null): ResolvedAuthError {
  const code = normalizeAuthErrorCode(raw)
  const entry = code === UNKNOWN_AUTH_ERROR_CODE ? undefined : AUTH_ERROR_CATALOG[code]

  return {
    ...(entry ?? AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE]),
    code,
    known: entry !== undefined,
  }
}
