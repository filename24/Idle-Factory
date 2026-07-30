import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { withParams } from '@/lib/href'
import { cn } from '@/lib/utils'

interface PaginationProps {
  readonly page: number
  readonly totalPages: number
  /** 유지할 쿼리 파라미터 (scope·sort 등). */
  readonly params: Record<string, string | number | undefined>
  /** 링크 베이스 경로 (기본 /ranking). */
  readonly basePath?: string
}

/**
 * 페이지네이션 — 이전/다음 링크 + 현재/총 페이지. 경계에서 링크를 비활성(span)으로 렌더.
 */
export async function Pagination({
  page,
  totalPages,
  params,
  basePath = '/ranking',
}: PaginationProps): Promise<React.ReactElement | null> {
  if (totalPages <= 1) return null
  const t = await getTranslations('pagination')
  const hasPrev = page > 1
  const hasNext = page < totalPages

  const baseCls = 'inline-flex h-9 items-center gap-1 rounded border px-3 text-sm transition-colors'
  const enabledCls =
    'border-hairline-strong text-body hover:bg-elevated hover:text-ink focus-visible:ring-ring focus-visible:ring-2 outline-none'
  const disabledCls = 'border-hairline text-ash cursor-not-allowed opacity-50'

  return (
    <nav aria-label={t('label')} className="flex items-center justify-center gap-4">
      {hasPrev ? (
        <Link
          href={withParams(basePath, { ...params, page: page - 1 })}
          rel="prev"
          className={cn(baseCls, enabledCls)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t('prev')}
        </Link>
      ) : (
        <span className={cn(baseCls, disabledCls)} aria-disabled="true">
          <ChevronLeft aria-hidden="true" className="size-4" />
          {t('prev')}
        </span>
      )}

      <span className="text-mute text-sm tabular-nums" aria-current="page">
        {page} / {totalPages}
      </span>

      {hasNext ? (
        <Link
          href={withParams(basePath, { ...params, page: page + 1 })}
          rel="next"
          className={cn(baseCls, enabledCls)}
        >
          {t('next')}
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : (
        <span className={cn(baseCls, disabledCls)} aria-disabled="true">
          {t('next')}
          <ChevronRight aria-hidden="true" className="size-4" />
        </span>
      )}
    </nav>
  )
}
