import { notFound } from 'next/navigation'
import { source } from '@/lib/source'
import { Steps, Step } from 'fumadocs-ui/components/steps'
import defaultMdxComponents from 'fumadocs-ui/mdx'

export const runtime = 'nodejs'

interface Props {
  params: Promise<{ slug?: string[] }>
}

const mdxComponents = {
  ...defaultMdxComponents,
  Steps,
  Step,
}

/** 문서 페이지 — MDX 파일을 렌더링 */
export default async function DocsPage({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)

  if (!page) notFound()

  const { body: MDX } = page.data

  return (
    <article className="prose prose-invert max-w-3xl">
      <h1 className="font-display text-ink mb-2 text-3xl leading-[1.05] tracking-[-0.02em] break-keep">
        {page.data.title}
      </h1>
      {page.data.description && (
        <p className="text-mute mb-8 break-keep">{page.data.description}</p>
      )}
      <div className="docs-content">
        <MDX components={mdxComponents} />
      </div>
    </article>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) return {}
  return {
    title: `${page.data.title} — Idle Factory 가이드`,
    description: page.data.description,
  }
}
