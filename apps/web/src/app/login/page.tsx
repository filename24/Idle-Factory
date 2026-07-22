import { redirect } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { LoginButton } from './LoginButton'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

/** Discord OAuth 로그인 페이지 — 세션 존재 시 대시보드로 리다이렉트 */
export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(callbackUrl ?? '/dashboard')

  return (
    <section
      aria-labelledby="login-heading"
      className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4"
    >
      <div className="border-hairline-strong bg-surface w-full max-w-sm rounded border p-8 text-center">
        <div className="space-y-3">
          <LogIn aria-hidden="true" className="text-mute mx-auto size-6" />
          <h1
            id="login-heading"
            className="font-display text-ink text-3xl leading-[1.05] break-keep"
          >
            Idle Factory
          </h1>
          <p className="text-mute text-sm break-keep">
            Discord 계정으로 로그인하여 공장을 관리하세요
          </p>
        </div>
        <div className="mt-8">
          <LoginButton callbackUrl={callbackUrl} />
        </div>
      </div>
    </section>
  )
}
