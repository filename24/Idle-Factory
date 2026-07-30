import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import Content from './content.mdx'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('terms.meta')
  return { title: t('title') }
}

/**
 * 이용약관 페이지.
 *
 * 본문(`content.mdx`)은 법적 효력이 있는 한국어 원문이라 기계 번역 대상이 아니다.
 * 제목·메타데이터만 로케일을 따르고 본문은 원문 그대로 노출한다.
 */
export default async function TermsPage() {
  const t = await getTranslations('terms')

  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
        {t('title')}
      </h1>
      <article className="docs-content mt-10 break-keep">
        <Content />
      </article>
    </div>
  )
}
