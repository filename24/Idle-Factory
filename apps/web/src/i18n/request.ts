/**
 * next-intl 요청 설정 — 매 요청의 로케일과 메시지를 결정한다.
 *
 * `createNextIntlPlugin()` 이 이 파일을 기본 경로(`./src/i18n/request.ts`)로 찾는다.
 * URL 라우팅을 쓰지 않으므로 로케일은 오직 쿠키에서 온다.
 */

import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { LOCALE_COOKIE, resolveLocale } from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  // 쿠키 값은 반드시 화이트리스트로 정규화한 뒤에 import 경로에 넣는다.
  const locale = resolveLocale(store.get(LOCALE_COOKIE)?.value)

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
