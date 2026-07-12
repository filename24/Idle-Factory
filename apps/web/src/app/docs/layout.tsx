import { type ReactNode } from 'react'
import { headers } from 'next/headers'
import { DocsSidebar } from '@/components/docs/DocsSidebar'
import { DocsSearch } from '@/components/docs/DocsSearch'
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
      <aside className="border-hairline hidden w-56 shrink-0 border-r lg:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto">
          <div className="p-3">
            <DocsSearch />
          </div>
          <DocsSidebar tree={source.pageTree} currentPath={pathname} />
        </div>
      </aside>

      {/* 컨텐츠 (루트 layout.tsx가 이미 <main> 랜드마크를 제공하므로 여기선 div) */}
      <div className="min-w-0 flex-1 py-10 lg:pl-10">{children}</div>
    </div>
  )
}
