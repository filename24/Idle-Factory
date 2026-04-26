import Link from 'next/link'

/** 공통 하단 푸터 */
export function Footer() {
  return (
    <footer className="bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
        {/* 모바일: 세로 스택 / 데스크탑: 좌우 분리 */}
        <div className="flex flex-col items-center gap-3 text-xs text-[var(--color-muted-foreground)]/50 sm:flex-row sm:justify-between sm:gap-0">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center sm:gap-5">
            <span>Copyright © 2025 Idle Factory. All rights reserved.</span>
            <div className="flex items-center gap-4 sm:gap-5">
              <Link
                href="/docs"
                className="transition-colors hover:text-[var(--color-muted-foreground)]"
              >
                문서
              </Link>
              <Link
                href="/terms"
                className="transition-colors hover:text-[var(--color-muted-foreground)]"
              >
                이용약관
              </Link>
              <Link
                href="https://inft.kr/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--color-muted-foreground)]"
              >
                개인정보 처리방침
              </Link>
              <Link
                href="https://discord.gg/idle-factory"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--color-muted-foreground)]"
              >
                Discord 서버
              </Link>
            </div>
          </div>
          <Link
            href="https://inft.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--color-muted-foreground)]"
          >
            Designed by Infinite Studio
          </Link>
        </div>
      </div>
    </footer>
  )
}
