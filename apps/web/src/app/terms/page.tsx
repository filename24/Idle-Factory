import type { Metadata } from 'next'
import Content from './content.mdx'

export const metadata: Metadata = {
  title: '이용약관 — Idle Factory',
}

/** 이용약관 페이지 */
export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <article className="prose prose-invert max-w-none">
        <Content />
      </article>
    </div>
  )
}
