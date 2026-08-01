import { betterFetch } from '@better-fetch/fetch'
import { NextResponse, type NextRequest } from 'next/server'
import type { Session } from '@/lib/auth'

// 인증이 필요한 경로. 서버 통계(/dashboard/[guildId])는 공개이므로 제외한다.
// (#20 §권한: "서버 통계 공개, 개인은 세션 필수")
const PROTECTED_PATHS = ['/dashboard/me', '/onboarding']

/**
 * 서버 설정 콘솔 — `/dashboard/<snowflake>/settings`.
 *
 * 동적 세그먼트라 PROTECTED_PATHS 의 접두 목록으로는 표현할 수 없다.
 * 여기서 막는 것은 미로그인 사용자를 로그인으로 보내기 위한 편의일 뿐이고,
 * 실제 인가는 페이지와 각 Server Action 의 requireGuildAdmin 이 담당한다.
 */
const GUILD_SETTINGS_PATTERN = /^\/dashboard\/\d{5,25}\/settings(?:\/|$)/

/** 정확 일치 또는 하위 경로(prefix + '/')만 보호로 판정. */
function isProtectedPath(pathname: string): boolean {
  // /dashboard 인덱스는 /dashboard/me 로 리다이렉트되므로 함께 보호한다.
  if (pathname === '/dashboard') return true
  if (GUILD_SETTINGS_PATTERN.test(pathname)) return true
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (!isProtectedPath(pathname)) return NextResponse.next()

  const { data: session } = await betterFetch<Session>('/api/auth/get-session', {
    baseURL: request.nextUrl.origin,
    headers: { cookie: request.headers.get('cookie') ?? '' },
  })

  if (!session) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/onboarding/:path*'],
}
