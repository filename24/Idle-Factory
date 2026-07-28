import type { Metadata } from 'next'
import Link from 'next/link'
import {
  House,
  MessageSquare,
  RotateCcw,
  ServerCrash,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react'
import { resolveAuthError, type AuthErrorKind } from '@/lib/auth-errors'
import { safeInternalPath } from '@/lib/href'

/** 운영 문의 창구 — 설정 오류·계정 제재처럼 사용자가 풀 수 없는 건을 받는다. */
const SUPPORT_URL = 'https://discord.gg/idle-factory'

export const metadata: Metadata = {
  title: '로그인 실패 — Idle Factory',
  description: 'Discord 로그인 중 발생한 문제와 해결 방법을 안내합니다.',
  // 실패 화면이 검색 결과에 노출될 이유가 없다.
  robots: { index: false, follow: false },
}

interface Props {
  searchParams: Promise<{ error?: string; error_description?: string; callbackUrl?: string }>
}

/** 책임 소재별 아이콘 — 사용자가 자기 문제인지 서비스 문제인지 한눈에 알게 한다. */
const KIND_ICON: Record<AuthErrorKind, typeof TriangleAlert> = {
  user: TriangleAlert,
  config: ShieldAlert,
  server: ServerCrash,
}

/** 책임 소재별 강조색. */
const KIND_COLOR: Record<AuthErrorKind, string> = {
  user: 'text-accent-orange',
  config: 'text-accent-red',
  server: 'text-accent-red',
}

/** 책임 소재별 배지 문구. */
const KIND_LABEL: Record<AuthErrorKind, string> = {
  user: '로그인 절차 문제',
  config: '서비스 설정 문제',
  server: '일시적 서버 문제',
}

const primaryButtonClass =
  'bg-accent-blue-btn hover:bg-accent-blue-hover focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 w-full items-center justify-center gap-2 rounded border border-transparent px-5 text-base font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'

const secondaryButtonClass =
  'border-hairline-strong text-mute hover:text-ink hover:bg-canvas focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 w-full items-center justify-center gap-2 rounded border px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'

/**
 * better-auth 인증 실패 안내 페이지.
 *
 * better-auth 는 OAuth 흐름이 깨지면 `?error=<코드>` 를 붙여 이곳으로 보낸다.
 * 기본 제공 페이지는 영문 HTML 이라 이 라우트가 대신 받는다
 * (`src/lib/auth.ts` 의 `onAPIError.errorURL`).
 */
export default async function AuthErrorPage({ searchParams }: Props) {
  const { error, error_description: errorDescription, callbackUrl } = await searchParams
  const resolved = resolveAuthError(error)
  const Icon = KIND_ICON[resolved.kind]

  // 실패한 로그인이 원래 가려던 곳으로 재시도를 이어 붙인다.
  const safeCallback = safeInternalPath(callbackUrl)
  const retryHref = `/login?callbackUrl=${encodeURIComponent(safeCallback)}`

  return (
    <section
      aria-labelledby="auth-error-heading"
      className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center px-4 py-12"
    >
      <div className="border-hairline-strong bg-surface w-full max-w-md rounded border p-8">
        <div className="space-y-4 text-center">
          <Icon aria-hidden="true" className={`mx-auto size-7 ${KIND_COLOR[resolved.kind]}`} />
          <p className="text-mute text-xs font-bold tracking-[0.18em] uppercase">
            {KIND_LABEL[resolved.kind]}
          </p>
          <h1
            id="auth-error-heading"
            className="font-display text-ink text-2xl leading-[1.15] break-keep"
          >
            {resolved.title}
          </h1>
          <p className="text-charcoal text-sm leading-relaxed break-keep">{resolved.description}</p>
        </div>

        <div className="mt-8 flex flex-col gap-3">
          {resolved.action === 'retry' && (
            <Link href={retryHref} className={primaryButtonClass}>
              <RotateCcw aria-hidden="true" className="size-[18px]" />
              다시 로그인
            </Link>
          )}

          {resolved.action === 'support' && (
            <Link
              href={SUPPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={primaryButtonClass}
            >
              <MessageSquare aria-hidden="true" className="size-[18px]" />
              Discord 서버에서 문의
            </Link>
          )}

          <Link
            href="/"
            className={resolved.action === 'home' ? primaryButtonClass : secondaryButtonClass}
          >
            <House aria-hidden="true" className="size-[18px]" />
            홈으로 돌아가기
          </Link>
        </div>

        {/* 문의 시 읽어줄 단서. 카탈로그에 없는 코드일수록 이 값이 유일한 실마리다. */}
        <dl className="border-hairline mt-8 border-t pt-5 text-xs">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-mute shrink-0">에러 코드</dt>
            <dd className="text-charcoal truncate font-mono">{resolved.code}</dd>
          </div>
          {errorDescription && (
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <dt className="text-mute shrink-0">상세</dt>
              <dd className="text-charcoal break-all">{errorDescription}</dd>
            </div>
          )}
          {!resolved.known && (
            <p className="text-mute mt-3 leading-relaxed break-keep">
              처음 보는 오류입니다. 위 코드를 함께 알려 주시면 원인을 빨리 찾을 수 있습니다.
            </p>
          )}
        </dl>
      </div>
    </section>
  )
}
