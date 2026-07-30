import { describe, test, expect } from 'vitest'
import ko from '../../messages/ko.json'
import en from '../../messages/en.json'
import {
  AUTH_ERROR_CATALOG,
  normalizeAuthErrorCode,
  resolveAuthError,
  UNKNOWN_AUTH_ERROR_CODE,
} from '../../src/lib/auth-errors'

describe('normalizeAuthErrorCode', () => {
  test('값이 없으면 unknown 으로 떨어진다', () => {
    expect(normalizeAuthErrorCode(undefined)).toBe(UNKNOWN_AUTH_ERROR_CODE)
    expect(normalizeAuthErrorCode(null)).toBe(UNKNOWN_AUTH_ERROR_CODE)
    expect(normalizeAuthErrorCode('')).toBe(UNKNOWN_AUTH_ERROR_CODE)
    expect(normalizeAuthErrorCode('   ')).toBe(UNKNOWN_AUTH_ERROR_CODE)
  })

  test('대소문자를 구분하지 않는다', () => {
    // better-auth 는 BASE_ERROR_CODES 를 대문자 슬러그로도 넘긴다(INVALID_TOKEN).
    expect(normalizeAuthErrorCode('INVALID_TOKEN')).toBe('invalid_token')
    expect(normalizeAuthErrorCode('Access_Denied')).toBe('access_denied')
  })

  test('사람이 읽는 메시지를 슬러그로 바꾼다', () => {
    // redirectOnError(BASE_ERROR_CODES.USER_NOT_FOUND) 는 "User not found" 를 그대로 넘긴다.
    expect(normalizeAuthErrorCode('User not found')).toBe('user_not_found')
    expect(normalizeAuthErrorCode('You have been banned from this application')).toBe(
      'you_have_been_banned_from_this_application',
    )
  })

  test('앞뒤 공백과 중복 구분자를 정리한다', () => {
    expect(normalizeAuthErrorCode('  state_mismatch  ')).toBe('state_mismatch')
    expect(normalizeAuthErrorCode('state   mismatch')).toBe('state_mismatch')
    expect(normalizeAuthErrorCode('__state_mismatch__')).toBe('state_mismatch')
  })

  test('영숫자와 언더스코어 외의 문자를 제거한다', () => {
    // 쿼리스트링은 신뢰 불가 입력이다. 마크업이 그대로 코드로 새어나가면 안 된다.
    expect(normalizeAuthErrorCode('<script>alert(1)</script>')).toBe('scriptalert1script')
    expect(normalizeAuthErrorCode("email_doesn't_match")).toBe('email_doesnt_match')
  })

  test('과도하게 긴 입력을 잘라낸다', () => {
    const result = normalizeAuthErrorCode('a'.repeat(500))
    expect(result.length).toBeLessThanOrEqual(64)
  })

  test('정리 후 남는 것이 없으면 unknown 이다', () => {
    expect(normalizeAuthErrorCode('!!!')).toBe(UNKNOWN_AUTH_ERROR_CODE)
    expect(normalizeAuthErrorCode('___')).toBe(UNKNOWN_AUTH_ERROR_CODE)
  })
})

describe('AUTH_ERROR_CATALOG', () => {
  test('better-auth 1.6.9 가 실제로 던지는 코드를 모두 담는다', () => {
    // 출처: node_modules/better-auth/dist 의 redirectOnError/?error= 호출부 전수 조사.
    const observed = [
      // OAuth2 표준 — Discord 가 그대로 전달하는 코드
      'access_denied',
      'invalid_request',
      'invalid_scope',
      'unauthorized_client',
      'unsupported_response_type',
      'temporarily_unavailable',
      'server_error',
      // 자격증명·설정 오류
      'invalid_client',
      'client_disabled',
      'invalid_redirect_uri',
      'oauth_provider_not_found',
      'no_callback_url',
      'invalid_callback_request',
      // 인가 코드 교환 단계
      'no_code',
      'invalid_code',
      'oauth_code_verification_failed',
      'state_mismatch',
      'please_restart_the_process',
      'payload_expired',
      'invalid_payload',
      // 프로필 조회 단계
      'unable_to_get_user_info',
      'user_info_is_missing',
      'invalid_profile',
      'missing_profile',
      'email_is_missing',
      'email_not_found',
      'name_is_missing',
      // 계정 연결·생성 단계
      'unable_to_link_account',
      'account_already_linked_to_different_user',
      'email_doesnt_match',
      'user_creation_failed',
      'signup_disabled',
      // 세션·토큰
      'invalid_token',
      'token_expired',
      'invalid_user',
      'user_not_found',
      'banned',
      // 서버
      'internal_server_error',
    ]
    for (const code of observed) {
      expect(AUTH_ERROR_CATALOG, `카탈로그에 ${code} 누락`).toHaveProperty(code)
    }
  })

  test('unknown 폴백 항목을 포함한다', () => {
    expect(AUTH_ERROR_CATALOG).toHaveProperty(UNKNOWN_AUTH_ERROR_CODE)
  })

  // 표시 문구는 messages/<locale>.json 으로 옮겼다. 분류만 추가하고 메시지를
  // 빼먹으면 화면에 `authError.foo.title` 같은 키 문자열이 그대로 나온다.
  test('모든 항목이 ko/en 양쪽에 제목과 설명을 가진다', () => {
    const catalogs = { ko: ko.authError, en: en.authError } as Record<
      string,
      Record<string, { title?: string; description?: string }>
    >
    for (const code of Object.keys(AUTH_ERROR_CATALOG)) {
      for (const [locale, messages] of Object.entries(catalogs)) {
        const entry = messages[code]
        expect(entry, `${locale} 에 ${code} 메시지가 없다`).toBeDefined()
        expect(entry?.title?.trim(), `${locale}/${code} title 이 비었다`).toBeTruthy()
        expect(entry?.description?.trim(), `${locale}/${code} description 이 비었다`).toBeTruthy()
      }
    }
  })

  test('메시지 카탈로그에 분류 없는 고아 코드가 없다', () => {
    // 반대 방향 — 메시지만 있고 분류가 없으면 kind/action 이 폴백으로 잘못 잡힌다.
    const META_KEYS = ['meta', 'kind', 'actions', 'detail']
    const orphans = Object.keys(ko.authError)
      .filter((key) => !META_KEYS.includes(key))
      .filter((code) => !(code in AUTH_ERROR_CATALOG))
    expect(orphans).toEqual([])
  })

  test('모든 항목이 유효한 kind 와 action 을 가진다', () => {
    for (const [code, entry] of Object.entries(AUTH_ERROR_CATALOG)) {
      expect(['user', 'config', 'server'], `${code} kind 가 잘못됐다`).toContain(entry.kind)
      expect(['retry', 'home', 'support'], `${code} action 이 잘못됐다`).toContain(entry.action)
    }
  })

  test('설정 오류는 재시도를 권하지 않는다', () => {
    // 운영자가 고쳐야 하는 문제다. 사용자에게 "다시 시도"를 띄우면 무한 루프가 된다.
    for (const [code, entry] of Object.entries(AUTH_ERROR_CATALOG)) {
      if (entry.kind === 'config') {
        expect(entry.action, `${code} 는 재시도를 권하면 안 된다`).not.toBe('retry')
      }
    }
  })
})

describe('resolveAuthError', () => {
  test('알려진 코드는 그대로 메시지 코드가 된다', () => {
    const result = resolveAuthError('access_denied')
    expect(result.code).toBe('access_denied')
    expect(result.messageCode).toBe('access_denied')
    expect(result.known).toBe(true)
  })

  test('사용자가 Discord 에서 취소한 경우를 재시도 가능으로 분류한다', () => {
    const result = resolveAuthError('access_denied')
    expect(result.kind).toBe('user')
    expect(result.action).toBe('retry')
  })

  test('invalid_client 를 설정 오류로 분류한다', () => {
    // 2026-07-28 프로덕션 장애의 실제 코드. 사용자가 아무리 눌러도 해결되지 않는다.
    const result = resolveAuthError('invalid_client')
    expect(result.kind).toBe('config')
    expect(result.action).not.toBe('retry')
  })

  test('알 수 없는 코드는 폴백 분류로 떨어진다', () => {
    const result = resolveAuthError('something_we_never_saw')
    expect(result.known).toBe(false)
    expect(result.kind).toBe(AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE]!.kind)
    expect(result.action).toBe(AUTH_ERROR_CATALOG[UNKNOWN_AUTH_ERROR_CODE]!.action)
  })

  test('알 수 없는 코드의 messageCode 는 unknown 으로 눌린다', () => {
    // code 를 그대로 t() 에 넘기면 키가 없어 렌더가 깨진다.
    const result = resolveAuthError('something_we_never_saw')
    expect(result.messageCode).toBe(UNKNOWN_AUTH_ERROR_CODE)
  })

  test('알 수 없는 코드여도 원본 코드를 보존한다', () => {
    // 문의 시 사용자가 읽어줄 단서다. 폴백이 원본을 삼키면 안 된다.
    const result = resolveAuthError('something_we_never_saw')
    expect(result.code).toBe('something_we_never_saw')
  })

  test('값이 없으면 unknown 코드로 해석한다', () => {
    const result = resolveAuthError(undefined)
    expect(result.code).toBe(UNKNOWN_AUTH_ERROR_CODE)
    expect(result.known).toBe(false)
  })

  test('정규화를 거쳐 카탈로그와 매칭한다', () => {
    expect(resolveAuthError('STATE_MISMATCH').known).toBe(true)
    expect(resolveAuthError('User not found').code).toBe('user_not_found')
    expect(resolveAuthError('User not found').known).toBe(true)
  })

  test('카탈로그의 모든 실제 코드가 해석 가능하다', () => {
    // unknown 은 폴백 콘텐츠 자리이지 실제로 관측되는 코드가 아니므로 제외한다.
    const realCodes = Object.keys(AUTH_ERROR_CATALOG).filter((c) => c !== UNKNOWN_AUTH_ERROR_CODE)
    expect(realCodes.length).toBeGreaterThan(0)
    for (const code of realCodes) {
      const result = resolveAuthError(code)
      expect(result.known, `${code} 가 해석되지 않는다`).toBe(true)
      expect(result.code).toBe(code)
    }
  })

  test('정리 후 남는 것이 없는 입력은 미지의 에러로 취급한다', () => {
    // '!!!' 는 unknown 으로 정규화되지만 전용 콘텐츠를 찾은 것이 아니다.
    expect(resolveAuthError('!!!').known).toBe(false)
  })
})
