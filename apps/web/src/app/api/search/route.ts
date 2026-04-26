import { source } from '@/lib/source'
import { createFromSource } from 'fumadocs-core/search/server'
import { createKoreanTokenizer } from '@/lib/korean-tokenizer'

const { GET } = createFromSource(source, {
  components: {
    tokenizer: createKoreanTokenizer(),
  },
  search: {
    threshold: 0,
    tolerance: 0,
  },
})

export { GET }
