'use client'

import { useSession, signIn, signOut } from '@/lib/auth-client'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
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
    return <div className="h-6 w-6 animate-pulse rounded-full bg-[var(--color-elevated)]" />
  }

  if (session?.user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="group flex items-center gap-2 outline-none">
          <Avatar
            size="sm"
            className="ring-2 ring-transparent transition-all group-hover:ring-[var(--color-gold-dim)]"
          >
            <AvatarImage src={session.user.image ?? undefined} alt={session.user.name ?? ''} />
            <AvatarFallback className="bg-[var(--color-elevated)] text-[var(--color-gold)]">
              {(session.user.name ?? '?').charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden text-sm text-[var(--color-muted-foreground)] transition-colors group-hover:text-[var(--color-foreground)] sm:block">
            {session.user.name}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => signOut()}>로그아웃</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Button
      variant="default"
      size="sm"
      onClick={() => signIn.social({ provider: 'discord', callbackURL: '/dashboard' })}
    >
      로그인
    </Button>
  )
}
