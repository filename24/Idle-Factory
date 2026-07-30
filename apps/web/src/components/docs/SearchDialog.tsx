'use client'

import { useState, useEffect, useRef } from 'react'
import { useDocsSearch } from 'fumadocs-core/search/client'
import { Search, FileText, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { SharedProps } from 'fumadocs-ui/contexts/search'

interface SearchResult {
  id: string
  url: string
  type: 'page' | 'heading' | 'text'
  content: string
  breadcrumbs?: string[]
}

/** 한글 토크나이저 기반 문서 검색 다이얼로그 */
export default function DocsSearchDialog({ open, onOpenChange }: SharedProps) {
  const t = useTranslations('docs.search')
  // 검색 인덱스는 현재 표시 로케일을 그대로 따라간다. 'ko' 로 고정하면
  // 영어 화면에서도 한국어 토크나이저가 돌아 결과가 어긋난다.
  const locale = useLocale()
  const { search, setSearch, query } = useDocsSearch({ type: 'fetch', locale })
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const prevFocusRef = useRef<HTMLElement | null>(null)
  const [selected, setSelected] = useState(0)

  const results = query.data && query.data !== 'empty' ? query.data : []

  useEffect(() => {
    if (open) {
      // 열릴 때 이전 포커스 저장 후 입력창으로 포커스 이동
      prevFocusRef.current = document.activeElement as HTMLElement | null
      const t = setTimeout(() => {
        inputRef.current?.focus()
        setSelected(0)
      }, 50)
      setSearch('')
      return () => clearTimeout(t)
    }
    // 닫힐 때 트리거로 포커스 복원 (SC 2.4.3)
    prevFocusRef.current?.focus?.()
  }, [open, setSearch])

  useEffect(() => {
    setTimeout(() => setSelected(0), 0)
  }, [results.length])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((v) => Math.min(v + 1, results.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((v) => Math.max(v - 1, 0))
      }
      if (e.key === 'Enter' && results[selected]) {
        onOpenChange(false)
        window.location.href = (results[selected] as { url: string }).url
      }
      if (e.key === 'Escape') {
        onOpenChange(false)
      }
      // Tab 포커스 트랩 — 모달 밖으로 포커스가 새지 않도록 순환 (SC 2.4.3)
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button, input, [tabindex]:not([tabindex="-1"])',
        )
        if (!focusables || focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* 오버레이 */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />

      {/* 다이얼로그 */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('dialogLabel')}
        className="border-hairline-strong bg-surface relative z-10 mx-4 w-full max-w-xl overflow-hidden rounded border"
      >
        {/* 검색 입력 */}
        <div className="border-hairline bg-deep flex items-center gap-3 border-b px-4 py-3">
          <Search aria-hidden="true" className="text-mute size-4 shrink-0" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('placeholder')}
            aria-label={t('dialogLabel')}
            className="text-ink placeholder:text-mute flex-1 bg-transparent text-sm outline-none"
          />
          <kbd
            onClick={() => onOpenChange(false)}
            className="border-hairline-strong text-mute cursor-pointer rounded border px-1.5 py-0.5 text-[10px]"
          >
            ESC
          </kbd>
        </div>

        {/* 결과 */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.isLoading && (
            <div className="text-mute px-4 py-8 text-center text-sm">{t('loading')}</div>
          )}

          {!query.isLoading && search && results.length === 0 && (
            <div className="text-mute px-4 py-8 text-center text-sm break-keep">
              {t('noResults')}
            </div>
          )}

          {!query.isLoading && !search && (
            <div className="text-mute px-4 py-8 text-center text-sm break-keep">{t('prompt')}</div>
          )}

          {results.length > 0 && (
            <ul className="py-2">
              {results.map((item, i) => {
                const result = item as SearchResult
                return (
                  <li key={result.id ?? i}>
                    <Link
                      href={result.url}
                      onClick={() => onOpenChange(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        i === selected
                          ? 'bg-elevated text-ink'
                          : 'text-charcoal hover:bg-elevated hover:text-ink'
                      }`}
                    >
                      <FileText aria-hidden="true" className="text-accent-blue size-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium break-keep">
                          {result.content as string}
                        </div>
                        {result.breadcrumbs && result.breadcrumbs.length > 0 && (
                          <div className="text-mute mt-0.5 truncate text-xs">
                            {(result.breadcrumbs as string[]).join(' › ')}
                          </div>
                        )}
                      </div>
                      <ChevronRight aria-hidden="true" className="text-mute size-3.5 shrink-0" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 푸터 */}
        <div className="border-hairline bg-deep text-mute flex items-center gap-3 border-t px-4 py-2 text-[10px]">
          <span>
            <kbd className="border-hairline-strong rounded border px-1 py-0.5">↑↓</kbd>{' '}
            {t('hintNavigate')}
          </span>
          <span>
            <kbd className="border-hairline-strong rounded border px-1 py-0.5">↵</kbd>{' '}
            {t('hintSelect')}
          </span>
          <span>
            <kbd className="border-hairline-strong rounded border px-1 py-0.5">ESC</kbd>{' '}
            {t('hintClose')}
          </span>
        </div>
      </div>
    </div>
  )
}
