import Link from 'next/link'
import { HeaderAuth } from './HeaderAuth'

/** 공통 상단 네비게이션 바 */
export function Header() {
  return (
    <header className="border-hairline bg-canvas/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* 로고 */}
        <Link
          href="/"
          className="text-ink hover:text-body flex items-center gap-2 font-semibold transition-colors"
        >
          <span className="text-lg">⚙️</span>
          <span>Idle Factory</span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1">
          <Link
            href="/docs"
            className="text-charcoal hover:bg-elevated hover:text-ink rounded-lg px-3 py-1.5 text-sm transition-colors"
          >
            문서
          </Link>
          <HeaderAuth />
        </nav>
      </div>
    </header>
  )
}
