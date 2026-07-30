/**
 * 웹 i18n 설정 — 지원 로케일, 쿠키 이름, 신뢰할 수 없는 값 정규화.
 *
 * URL 에 로케일을 넣지 않고 쿠키로만 관리한다(next-intl "without i18n routing").
 * `/ranking`, `/docs` 같은 기존 경로와 북마크, fumadocs 라우팅을 그대로 유지하기
 * 위한 선택이다. 대가로 `cookies()` 를 읽는 페이지는 동적 렌더링이 된다.
 *
 * 봇(`apps/bot/src/utils/language.ts`)은 디스코드 로케일 코드에 묶여 `en-US` 를
 * 쓰지만, 웹은 `<html lang>` 과 URL 관례를 따라 `en` 을 쓴다. 두 목록은 의도적으로
 * 별개다 — 같은 값을 공유하지 않는다.
 */

/** 메시지 카탈로그(`messages/<locale>.json`)가 존재하는 로케일. */
export const LOCALES = ['ko', 'en'] as const

/** {@link LOCALES} 의 원소 타입. */
export type Locale = (typeof LOCALES)[number]

/** 쿠키가 없거나 신뢰할 수 없을 때 쓰는 로케일. 한국어 우선 제품이다. */
export const DEFAULT_LOCALE: Locale = 'ko'

/** 로케일 선택을 담아 두는 쿠키 이름. next-intl 관례를 그대로 따른다. */
export const LOCALE_COOKIE = 'NEXT_LOCALE'

/**
 * 언어 전환 UI 에 노출할 표시 이름.
 *
 * 각 언어를 그 언어 자체로 적는다(endonym). 현재 표시 언어가 무엇이든 자기
 * 언어를 알아볼 수 있어야 하므로 메시지 카탈로그로 빼지 않는다.
 */
export const LOCALE_LABELS: Readonly<Record<Locale, string>> = {
  ko: '한국어',
  en: 'English',
}

/** 값이 지원 로케일인지 판별한다. */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * 쿠키 값을 지원 로케일로 정규화한다.
 *
 * 쿠키는 사용자가 임의로 바꿀 수 있는 입력이고, 이 값이 그대로
 * `messages/${locale}.json` 동적 import 경로에 들어간다. 화이트리스트 밖의
 * 값은 전부 기본 로케일로 눌러 경로 조작 가능성을 제거한다.
 *
 * @param cookieValue `NEXT_LOCALE` 쿠키 값 (없을 수 있음)
 */
export function resolveLocale(cookieValue: string | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE
}
