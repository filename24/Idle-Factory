'use client'

import { useEffect } from 'react'
import { RotateCw } from 'lucide-react'

/** 서버 대시보드 에러 경계 — 통계 조회 실패 시 재시도 UI. */
export default function GuildDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}): React.ReactElement {
  useEffect(() => {
    console.error('[dashboard/guild] 렌더 오류:', error)
  }, [error])

  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <h1 className="font-display text-ink text-2xl break-keep">통계를 불러오지 못했습니다</h1>
      <p className="text-mute max-w-sm text-sm break-keep">
        일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="border-hairline-strong bg-canvas text-ink hover:bg-elevated focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded border px-4 text-sm transition-colors outline-none focus-visible:ring-2"
      >
        <RotateCw aria-hidden="true" className="size-4" />
        다시 시도
      </button>
    </section>
  )
}
