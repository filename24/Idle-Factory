import type { Metadata } from 'next'
import Content from './content.mdx'

export const metadata: Metadata = {
  title: '이용약관 — Idle Factory',
}

/** 이용약관 페이지 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32">
      <h1 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
        이용약관
      </h1>
      <article className="prose prose-invert prose-headings:font-display prose-headings:tracking-[-0.02em] prose-headings:text-ink prose-p:text-body prose-p:leading-relaxed prose-strong:text-ink prose-a:text-link prose-a:no-underline hover:prose-a:underline prose-li:text-body prose-li:marker:text-mute prose-hr:border-hairline prose-blockquote:border-hairline-strong prose-blockquote:text-charcoal prose-code:text-ink mt-10 max-w-none break-keep">
        <Content />
      </article>
    </div>
  )
}
