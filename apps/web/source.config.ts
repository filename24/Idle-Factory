import { defineConfig, defineDocs } from 'fumadocs-mdx/config'

/** fumadocs-mdx 소스 설정 — content/docs 디렉토리에서 MDX 로드 */
export const docs = defineDocs({ dir: 'content/docs' })

export default defineConfig()
