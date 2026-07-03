/**
 * `runMarketPriceTick` 위임 로직 유닛 테스트.
 *
 * DB 의존 없음 — `MarketPriceService.priceTick` 을 mock 해 위임 호출(prisma
 * 전달), 반환값, 로그 분기(갱신 0건 vs N건)를 검증한다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  MARKET_PRICE_TICK_INTERVAL_MS,
  runMarketPriceTick
} from '../../src/scheduled-tasks/market-price-tick'
import { MarketPriceService } from '../../src/services/marketPrice'
import type { PrismaClient } from '@idle/database'

const fakePrisma = {} as PrismaClient

describe('runMarketPriceTick', () => {
  beforeEach(() => {
    // container.logger 는 클라이언트 없이는 미설정이므로 스텁 주입.
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('interval 은 30분이다 (docs/design/06-market.md §가격 변동)', () => {
    expect(MARKET_PRICE_TICK_INTERVAL_MS).toBe(30 * 60 * 1000)
  })

  it('priceTick 에 prisma 를 위임하고 updatedCount 를 반환한다', async () => {
    const spy = vi
      .spyOn(MarketPriceService, 'priceTick')
      .mockResolvedValue({ updatedCount: 13, rows: [] })

    const result = await runMarketPriceTick(fakePrisma)

    expect(spy).toHaveBeenCalledWith(fakePrisma)
    expect(result).toBe(13)
  })

  it('갱신된 자재가 있으면 info 로그를 1회 남긴다', async () => {
    vi.spyOn(MarketPriceService, 'priceTick').mockResolvedValue({
      updatedCount: 5,
      rows: []
    })

    await runMarketPriceTick(fakePrisma)

    expect(container.logger.info).toHaveBeenCalledOnce()
  })

  it('갱신된 자재가 없으면 info 로그를 남기지 않는다', async () => {
    vi.spyOn(MarketPriceService, 'priceTick').mockResolvedValue({
      updatedCount: 0,
      rows: []
    })

    const result = await runMarketPriceTick(fakePrisma)

    expect(result).toBe(0)
    expect(container.logger.info).not.toHaveBeenCalled()
  })
})
