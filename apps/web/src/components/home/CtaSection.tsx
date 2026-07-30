import { Check } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { CodeWindow } from '@/components/ui/CodeWindow'

/** 하단 CTA 섹션 — Discord 초대 + 문서 링크 */
export async function CtaSection() {
  const t = await getTranslations('home.cta')

  return (
    <section className="border-hairline border-t py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div className="text-mute mb-3 text-xs font-medium tracking-[0.18em] uppercase">
          <span className="text-ash">{'// '}</span>Start Now
        </div>
        <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
          {t('titleLine1')}
          <br />
          {t('titleLine2')}
        </h2>
        <p className="text-charcoal mx-auto mt-4 max-w-md text-base leading-relaxed break-keep">
          {t('body1')}
          <br className="hidden sm:block" />
          {t('body2')}
        </p>

        <CodeWindow label="Discord" className="mt-10 text-left">
          <p>
            <span className="text-ash">&gt; </span>
            <span className="text-ink">/invite</span>{' '}
            <span className="text-charcoal">idle-factory</span>
          </p>
          <p className="text-accent-green mt-1">
            <Check aria-hidden="true" className="inline size-3.5" /> {t('demoInvited')}
          </p>
          <p className="mt-3">
            <span className="text-ash">&gt; </span>
            <span className="text-ink">/factory build</span>{' '}
            <span className="text-charcoal">farm</span>
          </p>
          <p className="text-accent-green mt-1">
            <Check aria-hidden="true" className="inline size-3.5" /> {t('demoBuilding')}
          </p>
        </CodeWindow>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="border-hairline-strong bg-canvas text-ink hover:bg-elevated focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-10 items-center justify-center gap-2 rounded border px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t('ctaPrimary')}
          </Link>
          <Link
            href="/docs"
            className="border-hairline text-charcoal hover:bg-elevated hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-10 items-center justify-center gap-2 rounded border bg-transparent px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {t('ctaSecondary')}
          </Link>
        </div>

        {/* 하단 부연 */}
        <div className="border-hairline mt-16 flex flex-col gap-1 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-mute">{t('footnoteLeft')}</span>
          <span className="text-mute">{t('footnoteRight')}</span>
        </div>
      </div>
    </section>
  )
}
