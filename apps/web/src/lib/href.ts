/**
 * 쿼리스트링 링크 빌더 — 랭킹 탭/정렬/페이지네이션의 SSR 링크 구성에 사용.
 * 값이 undefined/빈문자열인 파라미터는 생략한다.
 */
export function withParams(
  base: string,
  params: Record<string, string | number | undefined | null>,
): string {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    sp.set(key, String(value))
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

/**
 * 오픈 리다이렉트 방지 — 내부 절대경로만 허용한다.
 *
 * '/' 로 시작하되 '//'(프로토콜 상대 URL)·'/\\'(백슬래시 우회)는 외부 목적지로
 * 간주해 fallback 을 반환한다. 로그인 후 callbackUrl 리다이렉트에 사용.
 *
 * @param url 사용자 제공 리다이렉트 경로(신뢰 불가)
 * @param fallback 안전하지 않을 때 반환할 기본 경로
 */
export function safeInternalPath(url: string | undefined | null, fallback = '/dashboard'): string {
  if (!url || !url.startsWith('/')) return fallback
  if (url.startsWith('//') || url.startsWith('/\\')) return fallback
  return url
}
