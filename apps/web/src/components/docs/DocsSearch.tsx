'use client'

import { useSearchContext } from 'fumadocs-ui/contexts/search'
import { Search } from 'lucide-react'

/** 문서 사이드바 검색 트리거 — ⌘K 단축키는 RootProvider가 처리 */
export function DocsSearch() {
  const { setOpenSearch } = useSearchContext()

  return (
    <button
      onClick={() => setOpenSearch(true)}
      className="border-hairline-strong bg-surface text-mute hover:text-ink flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:border-white/25"
    >
      <Search className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 text-left break-keep">검색...</span>
      <kbd className="border-hairline text-ash rounded-md border px-1.5 py-0.5 text-[10px] leading-none">
        ⌘K
      </kbd>
    </button>
  )
}
