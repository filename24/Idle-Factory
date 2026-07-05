import { redirect } from 'next/navigation'
import { LoginButton } from './LoginButton'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { Glow } from '@/components/ui/Glow'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

/** Discord OAuth 로그인 페이지 — 세션 존재 시 대시보드로 리다이렉트 */
export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(callbackUrl ?? '/dashboard')

  return (
    <main className="relative flex min-h-[calc(100dvh-3.5rem)] items-center justify-center overflow-hidden px-4">
      <Glow tone="blue" />
      <div className="border-hairline-strong bg-surface relative w-full max-w-sm rounded-xl border p-8 text-center">
        <div className="space-y-2">
          <div className="text-4xl">⚙️</div>
          <h1 className="font-display text-ink text-3xl leading-[1.05] tracking-[-0.02em] break-keep">
            Idle Factory
          </h1>
          <p className="text-charcoal text-sm break-keep">
            Discord 계정으로 로그인하여 공장을 관리하세요
          </p>
        </div>
        <div className="mt-8">
          <LoginButton callbackUrl={callbackUrl} />
        </div>
      </div>
    </main>
  )
}
