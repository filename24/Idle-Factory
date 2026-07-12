/**
 * `announceUnpaidPenalty` 디스패치 헬퍼 유닛 테스트.
 *
 * DB 의존 없음 — `AnnounceService.announceMany` 를 spy 해 전송 항목 수·대상
 * 길드·빌드 콜백이 만든 컨테이너 문구(penalty=10, credit 인터폴레이션)를
 * 검증한다. 실제 전송은 일어나지 않는다.
 */

import { container } from '@sapphire/framework'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TFunction } from 'i18next'

import { announceUnpaidPenalty } from '../../src/scheduled-tasks/daily-global'
import { AnnounceService } from '../../src/services/announce'

/** 인터폴레이션 인자를 문자열로 이어붙이는 최소 t 스텁. */
const fakeT = ((key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${JSON.stringify(opts)}` : key) as unknown as TFunction

describe('announceUnpaidPenalty', () => {
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

  it('패널티 서버마다 announceMany 로 daily 공지를 보내고 성공 건수를 반환한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(2)

    const sent = await announceUnpaidPenalty([
      { guildId: 'g-1', credit: 990 },
      { guildId: 'g-2', credit: 0 }
    ])

    expect(sent).toBe(2)
    expect(spy).toHaveBeenCalledTimes(1)
    const items = spy.mock.calls[0][0]
    expect(items.map((i) => i.guildId)).toEqual(['g-1', 'g-2'])
  })

  it('빌드 콜백은 penalty=10 과 credit 을 인터폴레이션한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(1)

    await announceUnpaidPenalty([{ guildId: 'g-1', credit: 990 }])

    const items = spy.mock.calls[0][0]
    const containers = items[0].build(fakeT)
    expect(containers).toHaveLength(1)
    const json = containers[0].toJSON() as {
      components: ReadonlyArray<{ content?: string }>
    }
    const contents = json.components.map((c) => c.content ?? '')
    expect(contents.some((c) => c.includes('daily.title'))).toBe(true)
    const body = contents.find((c) => c.includes('daily.body')) ?? ''
    expect(body).toContain('"penalty":10')
    expect(body).toContain('"credit":990')
  })

  it('패널티 서버가 없으면 announceMany 를 빈 배열로 호출하고 0 을 반환한다', async () => {
    const spy = vi.spyOn(AnnounceService, 'announceMany').mockResolvedValue(0)

    const sent = await announceUnpaidPenalty([])

    expect(sent).toBe(0)
    expect(spy).toHaveBeenCalledWith([])
  })
})
