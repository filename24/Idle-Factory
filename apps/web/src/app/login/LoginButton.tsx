'use client'

import { signIn } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'

interface Props {
  callbackUrl?: string
}

/** Discord OAuth 로그인 버튼 — 클라이언트 컴포넌트 */
export function LoginButton({ callbackUrl }: Props) {
  return (
    <Button
      variant="default"
      size="lg"
      className="w-full"
      onClick={() =>
        signIn.social({
          provider: 'discord',
          callbackURL: callbackUrl ?? '/dashboard',
        })
      }
    >
      Discord로 로그인
    </Button>
  )
}
