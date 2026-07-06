/**
 * `announceRedistribution` 디스패치 헬퍼 유닛 테스트.
 *
 * DB 의존 없음 — `AnnounceService.announceMany` 를 spy 해 amount>0 항목만
 * 전송되는지, 빌드 콜백이 monthly 키 + formatBigInt 포맷 금액을 쓰는지
 * 검증한다. 실제 전송은 일어나지 않는다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'

import { announceRedistribution } from '../../src/scheduled-tasks/monthly-redistribution'
import { AnnounceService } from '../../src/services/announce'

/** 인터폴레이션 인자를 문자열로 이어붙이는 최소 t 스텁. */
const fakeT = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${JSON.stringify(opts)}` : key) as unknown as TFunction

describe('announceRedistribution', () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('amount>0 항목만 announceMany 로 monthly 공지를 보내고 성공 건수를 반환한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(2)

    const sent = await announceRedistribution([
      { guildId: 'g-1', amount: 1_000n },
      { guildId: 'g-2', amount: 0n },
      { guildId: 'g-3', amount: 500n }
    ])

    expect(sent).toBe(2)
    expect(spy).toHaveBeenCalledTimes(1)
    const items = spy.mock.calls[0][0]
    expect(items.map((i) => i.guildId)).toEqual(['g-1', 'g-3'])
  })

  it('빌드 콜백은 monthly 키와 formatBigInt 로 포맷된 금액을 쓴다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(1)

    await announceRedistribution([{ guildId: 'g-1', amount: 1_234_567n }])

    const items = spy.mock.calls[0][0]
    const containers = items[0].build(fakeT)
    expect(containers).toHaveLength(1)
    const rendered = JSON.stringify(containers[0].toJSON())
    expect(rendered).toContain('game:server.announce.monthly.title')
    expect(rendered).toContain('game:server.announce.monthly.body')
    // formatBigInt(1234567) → "1,234,567" 이 인터폴레이션 인자로 들어간다.
    expect(rendered).toContain('1,234,567')
  })

  it('지급 대상이 없으면 announceMany 를 빈 배열로 호출하고 0 을 반환한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(0)

    const sent = await announceRedistribution([])

    expect(sent).toBe(0)
    expect(spy).toHaveBeenCalledWith([])
  })

  it('모든 항목의 amount 가 0 이면 빈 배열로 호출한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(0)

    const sent = await announceRedistribution([
      { guildId: 'g-1', amount: 0n },
      { guildId: 'g-2', amount: 0n }
    ])

    expect(sent).toBe(0)
    expect(spy).toHaveBeenCalledWith([])
  })
})
