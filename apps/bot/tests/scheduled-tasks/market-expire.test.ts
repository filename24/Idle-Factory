/**
 * `runMarketExpire` 위임 로직 유닛 테스트.
 *
 * DB 의존 없음 — `MarketService.expireStale` 을 mock 해 위임 호출(prisma 전달),
 * 반환값, 로그 분기(만료 0건 vs N건)를 검증한다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMarketExpire } from '../../src/scheduled-tasks/market-expire'
import { MarketService } from '../../src/services/market'
import type { PrismaClient } from '@idle/database'

const fakePrisma = {} as PrismaClient

describe('runMarketExpire', () => {
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

  it('expireStale 에 prisma 를 위임하고 expiredCount 를 반환한다', async () => {
    const spy = vi
      .spyOn(MarketService, 'expireStale')
      .mockResolvedValue({ expiredCount: 3 })

    const result = await runMarketExpire(fakePrisma)

    expect(spy).toHaveBeenCalledWith(fakePrisma)
    expect(result).toBe(3)
  })

  it('만료 매물이 있으면 info 로그를 1회 남긴다', async () => {
    vi.spyOn(MarketService, 'expireStale').mockResolvedValue({
      expiredCount: 5
    })

    await runMarketExpire(fakePrisma)

    expect(container.logger.info).toHaveBeenCalledOnce()
  })

  it('만료 매물이 없으면 info 로그를 남기지 않는다', async () => {
    vi.spyOn(MarketService, 'expireStale').mockResolvedValue({
      expiredCount: 0
    })

    const result = await runMarketExpire(fakePrisma)

    expect(result).toBe(0)
    expect(container.logger.info).not.toHaveBeenCalled()
  })
})
