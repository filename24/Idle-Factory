import Link from 'next/link'

/** 퀵링크 그룹 데이터 (레이블, 링크 목록) */
const linkGroups: Array<{
  title: string
  links: Array<{ label: string; href: string; external?: boolean }>
}> = [
  {
    title: '서비스',
    links: [
      { label: '문서', href: '/docs' },
      { label: '이용약관', href: '/terms' },
      {
        label: '개인정보 처리방침',
        href: 'https://inft.kr/privacy',
        external: true,
      },
    ],
  },
  {
    title: '커뮤니티',
    links: [
      {
        label: 'Discord 서버',
        href: 'https://discord.gg/7aFczQk',
        external: true,
      },
    ],
  },
]

/** 공통 하단 푸터 */
export function Footer() {
  return (
    <footer className="border-hairline bg-canvas border-t">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-8">
          {/* 로고 + 태그라인 컬럼 */}
          <div className="flex flex-col gap-3">
            <span className="font-display text-ink text-xl tracking-tight">Idle Factory</span>
            <p className="text-charcoal max-w-xs text-sm leading-relaxed break-keep">
              방치하면 자라나는 나만의 공장. 디스코드에서 시작하는 Idle Factory.
            </p>
          </div>

          {/* 퀵링크 그리드 */}
          {linkGroups.map((group) => (
            <nav key={group.title} aria-label={group.title} className="flex flex-col gap-3">
              <span className="text-ink text-xs font-bold tracking-[0.18em] uppercase">
                {group.title}
              </span>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* 하단 카피라이트 행 */}
        <div className="border-hairline text-mute mt-12 flex flex-col items-center gap-3 border-t pt-6 text-xs sm:flex-row sm:justify-between sm:gap-0">
          <span>Copyright © 2025 Idle Factory. All rights reserved.</span>
          <Link
            href="https://inft.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            Designed by Infinite Studio
          </Link>
        </div>
      </div>
    </footer>
  )
}
