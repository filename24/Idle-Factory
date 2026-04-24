'use client'

import Link from 'next/link'
import { useSession, signIn, signOut } from '@/lib/auth-client'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'

/** 헤더 우측 인증 영역 — 로그인 상태에 따라 아바타 또는 로그인 버튼 표시 */
export function HeaderAuth() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--color-elevated)]" />
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="group flex items-center gap-2">
          <Avatar
            src={session.user.image}
            name={session.user.name}
            size="sm"
            className="ring-2 ring-transparent transition-all group-hover:ring-[var(--color-gold-dim)]"
          />
          <span className="hidden text-sm text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-foreground)] sm:block">
            {session.user.name}
          </span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => signOut()}
          className="text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          로그아웃
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={() => signIn.social({ provider: 'discord', callbackURL: '/dashboard' })}
    >
      로그인
    </Button>
  )
}
