/**
 * `runStockDividend` 위임 로직 유닛 테스트.
 *
 * DB 의존 없음 — `StockDividendService.settleDividends` 을 mock 해 위임 호출
 * (prisma 전달), 반환값, 로그(요약 info + 종목 단위 실패 error)를 검증한다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  runStockDividend,
  STOCK_DIVIDEND_CRON
} from '../../src/scheduled-tasks/stock-dividend'
import {
  StockDividendService,
  type SettleDividendsResult
} from '../../src/services/stockDividend'
import type { PrismaClient } from '@idle/database'

const fakePrisma = {} as PrismaClient

function fakeResult(
  overrides: Partial<SettleDividendsResult>
): SettleDividendsResult {
  return {
    weekStart: new Date('2026-06-27T15:00:00Z'),
    settledStocks: 0,
    skippedStocks: 0,
    totalPaid: 0n,
    failures: [],
    ...overrides
  }
}

describe('runStockDividend', () => {
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

  it('cron 은 UTC 토 15:00 = KST 일 00:00 이다 (D2)', () => {
    expect(STOCK_DIVIDEND_CRON).toBe('0 15 * * 6')
  })

  it('settleDividends 에 prisma 를 위임하고 settledStocks 를 반환한다', async () => {
    const spy = vi
      .spyOn(StockDividendService, 'settleDividends')
      .mockResolvedValue(fakeResult({ settledStocks: 4 }))

    const result = await runStockDividend(fakePrisma)

    expect(spy).toHaveBeenCalledWith(fakePrisma)
    expect(result).toBe(4)
    expect(container.logger.info).toHaveBeenCalledOnce()
    expect(container.logger.error).not.toHaveBeenCalled()
  })

  it('종목 단위 실패는 건별 error 로그를 남기고 잡은 정상 종료한다', async () => {
    vi.spyOn(StockDividendService, 'settleDividends').mockResolvedValue(
      fakeResult({
        settledStocks: 1,
        failures: [
          { stockId: 's-1', message: 'boom' },
          { stockId: 's-2', message: 'kaboom' }
        ]
      })
    )

    const result = await runStockDividend(fakePrisma)

    expect(result).toBe(1)
    expect(container.logger.error).toHaveBeenCalledTimes(2)
  })
})
