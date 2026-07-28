'use client'

import { LogIn, LogOut } from 'lucide-react'
import { useSession, signIn, signOut } from '@/lib/auth-client'
import { useHydrated } from '@/hooks/useHydrated'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

/** 세션이 확정되기 전 자리를 잡아 두는 플레이스홀더. 서버·클라이언트 첫 렌더가 공유한다. */
function AuthSkeleton() {
  return <div aria-hidden="true" className="bg-elevated h-6 w-6 animate-pulse rounded-full" />
}

/** 헤더 우측 인증 영역 — 로그인 상태에 따라 아바타 드롭다운 또는 로그인 버튼 표시 */
export function HeaderAuth() {
  const { data: session, isPending } = useSession()

  // 하이드레이션 가드. better-auth 의 useStore 는 `useRef(store.get())` 로 스냅샷을
  // 잡고 getServerSnapshot 에도 같은 함수를 넘긴다(better-auth/dist/client/react/
  // react-store.mjs). 그래서 세션 fetch 가 하이드레이션보다 먼저 끝나면 첫 클라이언트
  // 렌더가 이미 isPending:false 로 계산돼 서버가 보낸 스켈레톤과 어긋난다.
  // 하이드레이션이 끝나기 전에는 무조건 스켈레톤을 그려 첫 렌더를 서버와 일치시킨다.
  const hydrated = useHydrated()

  if (!hydrated || isPending) {
    return <AuthSkeleton />
  }

  if (session?.user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={session.user.name ? `${session.user.name} 계정 메뉴` : '계정 메뉴'}
          className="group focus-visible:ring-ring focus-visible:ring-offset-canvas flex items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Avatar
            size="sm"
            className="ring-hairline-strong ring-0 transition-all group-hover:ring-2"
          >
            <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? ''} />
            <AvatarFallback className="bg-elevated text-ink">
              {(session.user.name ?? '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="text-mute group-hover:text-ink hidden text-sm transition-colors sm:block">
            {session.user.name}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="border-hairline-strong bg-surface w-48">
          <DropdownMenuItem
            onClick={() => signOut()}
            className="text-body hover:bg-elevated focus:bg-elevated gap-2"
          >
            <LogOut aria-hidden="true" className="size-4" />
            로그아웃
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <button
      type="button"
      onClick={() => signIn.social({ provider: 'discord', callbackURL: '/dashboard' })}
      className="border-hairline-strong bg-canvas text-ink hover:bg-elevated focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-9 items-center justify-center gap-2 rounded border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <LogIn aria-hidden="true" className="size-4" />
      로그인
    </button>
  )
}
