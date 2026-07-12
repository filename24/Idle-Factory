import type { Metadata } from 'next'
import Content from './content.mdx'

export const metadata: Metadata = {
  title: '이용약관 — Idle Factory',
}

/** 이용약관 페이지 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
        이용약관
      </h1>
      <article className="docs-content mt-10 break-keep">
        <Content />
      </article>
    </div>
  )
}
