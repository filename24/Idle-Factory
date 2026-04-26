'use client'

import { RootProvider } from 'fumadocs-ui/provider/next'
import SearchDialog from '@/components/docs/SearchDialog'
import type { ReactNode } from 'react'

/** fumadocs RootProvider — SearchDialog를 등록해 ⌘K 단축키 및 컨텍스트 제공 */
export function Providers({ children }: { children: ReactNode }) {
  return <RootProvider search={{ SearchDialog }}>{children}</RootProvider>
}
