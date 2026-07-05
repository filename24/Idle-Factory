'use client'

import { signIn } from '@/lib/auth-client'

interface Props {
  callbackUrl?: string
}

/** Discord OAuth 로그인 버튼 — 클라이언트 컴포넌트 */
export function LoginButton({ callbackUrl }: Props) {
  return (
    <button
      type="button"
      onClick={() =>
        signIn.social({
          provider: 'discord',
          callbackURL: callbackUrl ?? '/dashboard',
        })
      }
      className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 w-full items-center justify-center rounded-lg px-5 text-base font-medium transition-colors hover:bg-[#f1f7fe] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      Discord로 로그인
    </button>
  )
}
