'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCw } from 'lucide-react'

/**
 * 랭킹 라우트 에러 경계 — 쿼리/DB 실패 시 크래시 대신 재시도 UI 렌더.
 */
export default function RankingError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.ReactElement {
  const t = useTranslations()

  useEffect(() => {
    console.error('[ranking] 렌더 오류:', error)
  }, [error])

  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-ink text-2xl break-keep">{t('ranking.error.title')}</h1>
      <p className="text-mute max-w-sm text-sm break-keep">{t('ranking.error.description')}</p>
      <button
        type="button"
        onClick={reset}
        className="border-hairline-strong bg-canvas text-ink hover:bg-elevated focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded border px-4 text-sm transition-colors outline-none focus-visible:ring-2"
      >
        <RotateCw aria-hidden="true" className="size-4" />
        {t('common.retry')}
      </button>
    </section>
  )
}
