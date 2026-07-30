import { redirect } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { LoginButton } from './LoginButton'
import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { safeInternalPath } from '@/lib/href'

interface Props {
  searchParams: Promise<{ callbackUrl?: string }>
}

/** Discord OAuth 로그인 페이지 — 세션 존재 시 대시보드로 리다이렉트 */
export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl } = await searchParams
  // 오픈 리다이렉트 방지 — 외부 URL 은 /dashboard 로 폴백.
  const safeCallback = safeInternalPath(callbackUrl)

  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect(safeCallback)

  const t = await getTranslations('login')

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
          <p className="text-mute text-sm break-keep">{t('subtitle')}</p>
        </div>
        <div className="mt-8">
          <LoginButton callbackUrl={safeCallback} />
        </div>
      </div>
    </section>
  )
}
