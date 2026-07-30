'use server'

/**
 * 로케일 전환 Server Action.
 *
 * 쿠키를 쓰면 `getRequestConfig` 가 다음 렌더에서 새 로케일을 읽으므로,
 * `router.refresh()` 나 `startTransition` 없이 액션 완료만으로 화면이 갱신된다.
 */

import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './config'

/** 쿠키 만료 1년 — 재방문 시 선택을 유지한다. */
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * 로케일 쿠키를 설정한다.
 *
 * Server Action 은 클라이언트에서 임의 인자로 호출될 수 있으므로 값을 그대로
 * 믿지 않고 화이트리스트로 검증한다.
 *
 * @param locale 전환할 로케일
 */
export async function setLocale(locale: Locale): Promise<void> {
  const store = await cookies()
  store.set(LOCALE_COOKIE, isLocale(locale) ? locale : DEFAULT_LOCALE, {
    path: '/',
    maxAge: ONE_YEAR_SECONDS,
    sameSite: 'lax',
  })
}
