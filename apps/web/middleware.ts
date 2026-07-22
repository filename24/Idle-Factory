import { betterFetch } from '@better-fetch/fetch'
import { NextResponse, type NextRequest } from 'next/server'
import type { Session } from '@/lib/auth'

// 인증이 필요한 경로. 서버 통계(/dashboard/[guildId])는 공개이므로 제외한다.
// (#20 §권한: "서버 통계 공개, 개인은 세션 필수")
const PROTECTED_PATHS = ['/dashboard/me', '/onboarding']

/** 정확 일치 또는 하위 경로(prefix + '/')만 보호로 판정. */
function isProtectedPath(pathname: string): boolean {
  // /dashboard 인덱스는 /dashboard/me 로 리다이렉트되므로 함께 보호한다.
  if (pathname === '/dashboard') return true
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
