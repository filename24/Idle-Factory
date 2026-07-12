'use client'

import { MessageSquare } from 'lucide-react'
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
      className="bg-accent-blue-btn hover:bg-accent-blue-hover focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-transparent px-5 text-base font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <MessageSquare aria-hidden="true" className="size-[18px]" />
      Discord로 로그인
    </button>
  )
}
