import { docs } from '@/.source'
import { loader } from 'fumadocs-core/source'

/** fumadocs 소스 로더 — /docs 라우트에서 MDX 파일 검색 및 페이지 트리 생성 */
export const source = loader({
  baseUrl: '/docs',
  source: docs.toFumadocsSource(),
})
