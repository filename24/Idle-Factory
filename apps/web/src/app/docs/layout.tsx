import { type ReactNode } from 'react'
import { headers } from 'next/headers'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { source } from '@/lib/source'

export const runtime = 'nodejs'

interface Props {
  children: ReactNode
}

/** /docs 공통 레이아웃 — 사이드바 + 컨텐츠 영역 */
export default async function DocsLayout({ children }: Props) {
  const headerList = await headers()
  const pathname = headerList.get('x-pathname') ?? '/docs'

  return (
    <div className="mx-auto flex max-w-6xl gap-0 px-4 sm:px-6">
      {/* 사이드바 */}
      <aside className="hidden w-56 shrink-0 border-r border-[var(--color-border)] lg:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
          <DocsSidebar tree={source.pageTree} currentPath={pathname} />
        </div>
      </aside>

      {/* 컨텐츠 */}
      <main className="min-w-0 flex-1 py-10 lg:pl-10">{children}</main>
    </div>
  )
}
