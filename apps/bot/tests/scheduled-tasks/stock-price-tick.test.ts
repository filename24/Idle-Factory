/**
 * `runStockPriceTick` 위임 로직 유닛 테스트.
 *
 * DB 의존 없음 — `StockPriceService.priceTick` 을 mock 해 위임 호출(prisma
 * 전달), 반환값, 로그 분기(갱신 0건 vs N건)를 검증한다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  runStockPriceTick,
  STOCK_PRICE_TICK_INTERVAL_MS
} from '../../src/scheduled-tasks/stock-price-tick'
import { StockPriceService } from '../../src/services/stockPrice'
import type { PrismaClient } from '@idle/database'

const fakePrisma = {} as PrismaClient

describe('runStockPriceTick', () => {
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

  it('interval 은 1시간이다 (docs/design/08-stock.md §주가 변동)', () => {
    expect(STOCK_PRICE_TICK_INTERVAL_MS).toBe(60 * 60 * 1000)
  })

  it('priceTick 에 prisma 를 위임하고 updatedCount 를 반환한다', async () => {
    const spy = vi
      .spyOn(StockPriceService, 'priceTick')
      .mockResolvedValue({ updatedCount: 9, rows: [] })

    const result = await runStockPriceTick(fakePrisma)

    expect(spy).toHaveBeenCalledWith(fakePrisma)
    expect(result).toBe(9)
  })

  it('갱신된 종목이 있으면 info 로그를 1회 남긴다', async () => {
    vi.spyOn(StockPriceService, 'priceTick').mockResolvedValue({
      updatedCount: 3,
      rows: []
    })

    await runStockPriceTick(fakePrisma)

    expect(container.logger.info).toHaveBeenCalledOnce()
  })

  it('갱신된 종목이 없으면 info 로그를 남기지 않는다', async () => {
    vi.spyOn(StockPriceService, 'priceTick').mockResolvedValue({
      updatedCount: 0,
      rows: []
    })

    const result = await runStockPriceTick(fakePrisma)

    expect(result).toBe(0)
    expect(container.logger.info).not.toHaveBeenCalled()
  })
})
