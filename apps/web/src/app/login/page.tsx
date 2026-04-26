import { redirect } from 'next/navigation'
import { LoginButton } from './LoginButton'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams

  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(callbackUrl ?? '/dashboard')

  return (
    <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="text-5xl">⚙️</div>
          <h1 className="text-2xl font-bold text-[var(--color-foreground)]">Idle Factory</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            Discord 계정으로 로그인하여 공장을 관리하세요
          </p>
        </div>
        <LoginButton callbackUrl={callbackUrl} />
      </div>
    </main>
  )
}
