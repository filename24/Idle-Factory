'use client'

import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { Search } from 'lucide-react'

/** 문서 사이드바 검색 트리거 — ⌘K 단축키는 RootProvider가 처리 */
export function DocsSearch() {
  const { setOpenSearch } = useSearchContext()

  return (
    <button
      type="button"
      aria-label="문서 검색 열기"
      onClick={() => setOpenSearch(true)}
      className="border-input bg-surface text-mute hover:text-ink hover:border-hairline-strong focus-visible:ring-ring focus-visible:ring-offset-canvas flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Search aria-hidden="true" className="size-4 shrink-0" />
      <span className="flex-1 text-left break-keep">검색...</span>
      <kbd className="border-hairline text-mute rounded border px-1.5 py-0.5 text-[10px] leading-none">
        ⌘K
      </kbd>
    </button>
  )
}
