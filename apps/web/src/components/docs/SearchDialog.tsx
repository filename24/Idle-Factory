'use client'

import { useState, useEffect, useRef } from 'react'
import { useDocsSearch } from 'fumadocs-core/search/client'
import { Search, FileText, ChevronRight } from 'lucide-react'
import Link from 'next/link'
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
  const { search, setSearch, query } = useDocsSearch({ type: 'fetch', locale: 'ko' })
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState(0)

  const results = query.data && query.data !== 'empty' ? query.data : []

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setSearch('')
      setSelected(0)
    }
  }, [open, setSearch])

  useEffect(() => {
    setSelected(0)
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
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, results, selected, onOpenChange])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* 오버레이 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* 다이얼로그 */}
      <div className="relative z-10 mx-4 w-full max-w-xl overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        {/* 검색 입력 */}
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="문서 검색..."
            className="flex-1 bg-transparent text-sm text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
          />
          <kbd
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]"
          >
            ESC
          </kbd>
        </div>

        {/* 결과 */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.isLoading && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              검색 중...
            </div>
          )}

          {!query.isLoading && search && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              검색 결과가 없습니다.
            </div>
          )}

          {!query.isLoading && !search && (
            <div className="px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
              검색어를 입력하세요.
            </div>
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
                          ? 'bg-[var(--color-elevated)] text-[var(--color-foreground)]'
                          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-elevated)] hover:text-[var(--color-foreground)]'
                      }`}
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[var(--color-gold)]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{result.content as string}</div>
                        {result.breadcrumbs && result.breadcrumbs.length > 0 && (
                          <div className="mt-0.5 truncate text-xs opacity-60">
                            {(result.breadcrumbs as string[]).join(' › ')}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-40" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center gap-3 border-t border-[var(--color-border)] px-4 py-2 text-[10px] text-[var(--color-muted-foreground)]">
          <span>
            <kbd className="rounded border border-[var(--color-border)] px-1 py-0.5">↑↓</kbd> 이동
          </span>
          <span>
            <kbd className="rounded border border-[var(--color-border)] px-1 py-0.5">↵</kbd> 이동
          </span>
          <span>
            <kbd className="rounded border border-[var(--color-border)] px-1 py-0.5">ESC</kbd> 닫기
          </span>
        </div>
      </div>
    </div>
  )
}
