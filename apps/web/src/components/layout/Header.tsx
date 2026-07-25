import { Factory } from 'lucide-react'
import Link from 'next/link'
import { HeaderAuth } from './HeaderAuth'

/** 공통 상단 네비게이션 바 */
export function Header() {
  return (
    <header className="border-hairline bg-canvas sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
        {/* 로고 */}
        <Link
          href="/"
          className="text-ink hover:text-body focus-visible:ring-ring focus-visible:ring-offset-canvas flex items-center gap-2 rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        >
          <Factory aria-hidden="true" className="size-5" />
          <span className="font-display">Idle Factory</span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1">
          <Link
            href="/ranking"
            className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            랭킹
          </Link>
          <Link
            href="/dashboard/me"
            className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 max-sm:hidden"
          >
            대시보드
          </Link>
          <Link
            href="/docs"
            className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            문서
          </Link>
          <HeaderAuth />
        </nav>
      </div>
    </header>
  )
}
