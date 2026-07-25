/**
 * 기준가 테이블(`src/market/basePrices.ts`) 단위 테스트.
 *
 * 검증 축:
 *  - `packages/database/prisma/seed.ts` 의 `MARKET_BASE_PRICES` 와의 **드리프트 가드**
 *    (game-core 는 Prisma 를 import 할 수 없어 자동 동기화 수단이 없다 —
 *     시드 파일을 텍스트로 파싱해 값 일치를 강제한다)
 *  - T1 기준가 × 카탈로그 `baseProduction` 이 설계 목표 300~400원/tick 에 들어오는지
 *    (docs/design/00-onboarding.md §밸런스 기준)
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  baseMarketPrices,
  basePriceOf,
  getFactoryEntry,
  MARKET_BASE_PRICES,
  type MaterialType,
} from '../../src'

/** 시드 파일 경로 — 이 테스트 파일 기준 상대 경로. */
const SEED_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../database/prisma/seed.ts',
)

/**
 * 시드 파일에서 `MARKET_BASE_PRICES` 리터럴을 파싱한다.
 *
 * Prisma 의존 없이 드리프트만 잡는 것이 목적이라 정규식 파싱으로 충분하다.
 * 시드 리터럴의 형태가 바뀌어 파싱이 실패하면 테스트가 명시적으로 실패한다 —
 * 조용히 통과하지 않는다.
 */
function parseSeedBasePrices(): Record<string, bigint> {
  const source = readFileSync(SEED_PATH, 'utf8')
  const block = /const MARKET_BASE_PRICES[^{]*\{([\s\S]*?)\n\}/.exec(source)
  if (!block) {
    throw new Error(`MARKET_BASE_PRICES 블록을 seed.ts 에서 찾지 못했습니다: ${SEED_PATH}`)
  }
  const entries: Record<string, bigint> = {}
  for (const line of block[1]!.split('\n')) {
    const match = /^\s*([A-Z_]+):\s*([\d_]+)n,/.exec(line)
    if (match) entries[match[1]!] = BigInt(match[2]!.replace(/_/g, ''))
  }
  return entries
}

describe('MARKET_BASE_PRICES', () => {
  it('prisma/seed.ts 의 MARKET_BASE_PRICES 와 완전히 동일하다 (수동 동기화 가드)', () => {
    const seed = parseSeedBasePrices()

    // 파싱 자체가 무의미해지지 않도록 최소 개수를 먼저 확인한다.
    expect(Object.keys(seed).length).toBe(Object.keys(MARKET_BASE_PRICES).length)
    expect(seed).toEqual(
      Object.fromEntries(Object.entries(MARKET_BASE_PRICES)) as Record<string, bigint>,
    )
  })

  it('전 자재 기준가가 1 이상이다 (가격 0 방지)', () => {
    for (const [material, price] of Object.entries(MARKET_BASE_PRICES)) {
      expect(price, material).toBeGreaterThanOrEqual(1n)
    }
  })

  it('basePriceOf 가 테이블 값을 그대로 돌려준다', () => {
    expect(basePriceOf('GRAIN')).toBe(10n)
    expect(basePriceOf('CRUDE_OIL')).toBe(50n)
  })

  it('baseMarketPrices 는 호출마다 독립된 Map 을 만든다', () => {
    const a = baseMarketPrices()
    const b = baseMarketPrices()
    expect(a).not.toBe(b)
    expect(a.get('ORE')).toBe(20n)
    a.set('ORE', 999n)
    expect(b.get('ORE')).toBe(20n)
  })
})

describe('T1 기준가 × baseProduction (docs/design/00-onboarding.md §밸런스 기준)', () => {
  const T1 = ['FARM', 'MINE', 'LUMBER', 'OIL_WELL'] as const

  it.each(T1)('%s 의 등급1 tick당 수익이 300~400원 범위에 있다', (type) => {
    const entry = getFactoryEntry(type)
    const revenue = entry.baseProduction * MARKET_BASE_PRICES[entry.output as MaterialType]
    expect(revenue).toBeGreaterThanOrEqual(300n)
    expect(revenue).toBeLessThanOrEqual(400n)
  })
})
