/**
 * `AnnounceService` 유닛 테스트.
 *
 * 글로벌 이벤트(신뢰도·재분배·긴급지원금) 서버 공지의 단일 진입점.
 * DB·클라이언트를 mock 해 no-op 가드(클라이언트 미가용·채널 미설정·채널 없음·
 * 전송 불가)와 정상 전송(Components v2 페이로드) 경로를 검증한다.
 */

import { container } from '@sapphire/framework'
import { MessageFlags } from 'discord.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// fetchT 는 로케일 조회를 단순 키 반환 함수로 대체(전송 경로만 검증).
vi.mock('@sapphire/plugin-i18next', () => ({
  fetchT: vi.fn(async () => (key: string) => key)
}))

import { AnnounceService } from '../../src/services/announce'
import { simpleContainer } from '../../src/utils/ComponentsV2'

/** 전송 가능한 가짜 길드 텍스트 채널 + send 스파이. */
function fakeChannel(overrides: Record<string, unknown> = {}) {
  return {
    isSendable: () => true,
    isDMBased: () => false,
    guild: { id: 'g1' },
    send: vi.fn().mockResolvedValue({}),
    ...overrides
  }
}

/** container.client 를 채널 fetch 결과로 구성한다. */
function stubClient(channel: unknown) {
  ;(container as unknown as { client: unknown }).client = {
    channels: { fetch: vi.fn().mockResolvedValue(channel) }
  }
}

describe('AnnounceService.announce', () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
    container.db = {
      guild: { findUnique: vi.fn() }
    } as unknown as typeof container.db
    ;(container as unknown as { client: unknown }).client = undefined
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('클라이언트 미가용(테스트 환경)이면 DB 조회 없이 false 를 반환한다', async () => {
    ;(container as unknown as { client: unknown }).client = undefined

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
    expect(container.db.guild.findUnique).not.toHaveBeenCalled()
  })

  it('공지 채널이 설정되지 않았으면 채널 fetch 없이 false 를 반환한다', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: null
    })
    stubClient(fakeChannel())

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
    const client = (
      container as unknown as {
        client: { channels: { fetch: ReturnType<typeof vi.fn> } }
      }
    ).client
    expect(client.channels.fetch).not.toHaveBeenCalled()
  })

  it('채널을 찾을 수 없으면 false 를 반환한다', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: 'c1'
    })
    stubClient(null)

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
  })

  it('전송 불가 채널(isSendable=false)이면 false 를 반환한다', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: 'c1'
    })
    const channel = fakeChannel({ isSendable: () => false })
    stubClient(channel)

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('DM 채널이면 false 를 반환한다(공지는 서버 채널만)', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: 'c1'
    })
    const channel = fakeChannel({ isDMBased: () => true })
    stubClient(channel)

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
    expect(channel.send).not.toHaveBeenCalled()
  })

  it('정상 경로: Components v2 페이로드를 전송하고 true 를 반환한다', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: 'c1'
    })
    const channel = fakeChannel()
    stubClient(channel)

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x5865f2, '제목', '본문')
    ])

    expect(ok).toBe(true)
    expect(channel.send).toHaveBeenCalledTimes(1)
    const payload = channel.send.mock.calls[0][0]
    // v2 플래그가 반드시 포함되고 embeds/content 는 없어야 한다.
    expect(payload.flags & MessageFlags.IsComponentsV2).toBe(
      MessageFlags.IsComponentsV2
    )
    expect(payload.embeds).toBeUndefined()
    expect(payload.content).toBeUndefined()
    expect(Array.isArray(payload.components)).toBe(true)
  })

  it('전송 중 예외가 나도 던지지 않고 false 를 반환한다', async () => {
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      announceChannelId: 'c1'
    })
    const channel = fakeChannel({
      send: vi.fn().mockRejectedValue(new Error('boom'))
    })
    stubClient(channel)

    const ok = await AnnounceService.announce('g1', () => [
      simpleContainer(0x000000, undefined, 'hi')
    ])

    expect(ok).toBe(false)
    expect(container.logger.warn).toHaveBeenCalled()
  })
})

describe('AnnounceService.announceMany', () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
    container.db = {
      guild: { findUnique: vi.fn() }
    } as unknown as typeof container.db
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('성공 전송 건수만 집계한다(일부 실패 허용)', async () => {
    // g1 은 채널 설정, g2 는 미설정.
    ;(
      container.db.guild.findUnique as ReturnType<typeof vi.fn>
    ).mockImplementation(async ({ where }: { where: { id: string } }) => ({
      announceChannelId: where.id === 'g1' ? 'c1' : null
    }))
    const channel = fakeChannel()
    stubClient(channel)

    const sent = await AnnounceService.announceMany([
      {
        guildId: 'g1',
        build: () => [simpleContainer(0x000000, undefined, 'a')]
      },
      {
        guildId: 'g2',
        build: () => [simpleContainer(0x000000, undefined, 'b')]
      }
    ])

    expect(sent).toBe(1)
  })
})
