'use client'

import { useSession, signIn, signOut } from '@/lib/auth-client'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'

/** 헤더 우측 인증 영역 — 로그인 상태에 따라 아바타 드롭다운 또는 로그인 버튼 표시 */
export function HeaderAuth() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <div className="bg-elevated h-6 w-6 animate-pulse rounded-full" />
  }

  if (session?.user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="group flex items-center gap-2 outline-none">
          <Avatar
            size="sm"
            className="ring-2 ring-transparent transition-all group-hover:ring-white/25"
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
            className="text-body hover:bg-elevated focus:bg-elevated"
          >
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
      className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors hover:bg-[#f1f7fe] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      로그인
    </button>
  )
}
