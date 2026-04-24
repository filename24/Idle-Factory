import Link from 'next/link'
import { HeaderAuth } from './HeaderAuth'

/** 공통 상단 네비게이션 바 */
export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-canvas)/0.85] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* 로고 */}
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-[var(--color-foreground)] transition-colors hover:text-[var(--color-gold)]"
        >
          <span className="text-lg text-[var(--color-gold)]">⚙️</span>
          <span>Idle Factory</span>
        </Link>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-1">
          <Link
            href="/docs"
            className="rounded-[var(--radius-md)] px-3 py-1.5 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-elevated)] hover:text-[var(--color-foreground)]"
          >
            문서
          </Link>
          <HeaderAuth />
        </nav>
      </div>
    </header>
  )
}
