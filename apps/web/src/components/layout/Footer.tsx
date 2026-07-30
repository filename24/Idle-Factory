import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

/**
 * 퀵링크 그룹 구조 — 표시 문구는 메시지 키로만 들고 있다.
 *
 * 링크 대상(href)은 로케일과 무관한 사실이므로 여기에 두고, 사람이 읽는 문구는
 * `messages/<locale>.json` 이 단일 진실 소스가 된다.
 */
const linkGroups: Array<{
  titleKey: string
  links: Array<{ labelKey: string; href: string; external?: boolean }>
}> = [
  {
    titleKey: 'groups.service',
    links: [
      { labelKey: 'links.docs', href: '/docs' },
      { labelKey: 'links.terms', href: '/terms' },
      {
        labelKey: 'links.privacy',
        href: 'https://inft.kr/privacy',
        external: true,
      },
    ],
  },
  {
    titleKey: 'groups.community',
    links: [
      {
        labelKey: 'links.discord',
        href: 'https://discord.gg/7aFczQk',
        external: true,
      },
    ],
  },
]

/** 공통 하단 푸터 */
export async function Footer() {
  const t = await getTranslations('footer')

  return (
    <footer className="border-hairline bg-canvas border-t">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-[1.4fr_1fr_1fr] sm:gap-8">
          {/* 로고 + 태그라인 컬럼 */}
          <div className="flex flex-col gap-3">
            <span className="font-display text-ink text-xl tracking-tight">Idle Factory</span>
            <p className="text-charcoal max-w-xs text-sm leading-relaxed break-keep">
              {t('tagline')}
            </p>
          </div>

          {/* 퀵링크 그리드 */}
          {linkGroups.map((group) => (
            <nav
              key={group.titleKey}
              aria-label={t(group.titleKey)}
              className="flex flex-col gap-3"
            >
              <span className="text-ink text-xs font-bold tracking-[0.18em] uppercase">
                {t(group.titleKey)}
              </span>
              <ul className="flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.labelKey}>
                    <Link
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-mute hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    >
                      {t(link.labelKey)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* 하단 카피라이트 행 */}
        <div className="border-hairline text-mute mt-12 flex flex-col items-center gap-3 border-t pt-6 text-xs sm:flex-row sm:justify-between sm:gap-0">
          <span>{t('copyright')}</span>
          <Link
            href="https://inft.kr"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink focus-visible:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas rounded transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          >
            {t('designedBy')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
