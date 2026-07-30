import { notFound } from 'next/navigation'
import { source } from '@/lib/source'
import { Steps, Step } from 'fumadocs-ui/components/steps'
import defaultMdxComponents from 'fumadocs-ui/mdx'
import { getTranslations } from 'next-intl/server'

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
    <article className="max-w-3xl">
      <h1 className="font-display text-ink mb-2 text-3xl leading-[1.05] break-keep">
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
  const t = await getTranslations('docs.meta')
  return {
    title: t('titleSuffix', { title: page.data.title }),
    description: page.data.description,
  }
}
