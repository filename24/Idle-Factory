import Link from 'next/link'

/** 공통 하단 푸터 */
export function Footer() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <span className="text-[var(--color-gold)]">⚙️</span>
            <span>Idle Factory</span>
            <span>·</span>
            <span>Discord 기반 방치형 공장 게임</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
            <Link href="/docs" className="transition-colors hover:text-[var(--color-foreground)]">
              문서
            </Link>
            <Link
              href="https://discord.gg/idle-factory"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--color-foreground)]"
            >
              Discord 서버
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
