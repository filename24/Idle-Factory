/**
 * `gracefulShutdown` 유닛 테스트.
 *
 * container.tasks / container.db 와 client 를 mock 해 3단계(큐 → DB → 클라이언트)
 * 종료 호출과 단계 실패 격리(한 단계 실패 시 나머지 진행)를 검증한다.
 */

import { container } from '@sapphire/framework'
import type { Client } from 'discord.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { gracefulShutdown } from '../../src/utils/shutdown'

describe('gracefulShutdown', () => {
  beforeEach(() => {
    container.logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as typeof container.logger
  })

  it('tasks.close, db.disconnect, client.destroy 를 모두 호출한다', async () => {
    const close = vi.fn().mockResolvedValue(undefined)
    const disconnect = vi.fn().mockResolvedValue(true)
    const destroy = vi.fn().mockResolvedValue(undefined)
    container.tasks = { close } as unknown as typeof container.tasks
    container.db = { disconnect } as unknown as typeof container.db
    const client = { destroy } as unknown as Client

    await gracefulShutdown(client)

    expect(close).toHaveBeenCalledOnce()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('한 단계가 실패해도 나머지 단계는 계속 실행한다', async () => {
    const disconnect = vi.fn().mockResolvedValue(true)
    const destroy = vi.fn().mockResolvedValue(undefined)
    container.tasks = {
      close: vi.fn().mockRejectedValue(new Error('queue down'))
    } as unknown as typeof container.tasks
    container.db = { disconnect } as unknown as typeof container.db
    const client = { destroy } as unknown as Client

    await expect(gracefulShutdown(client)).resolves.toBeUndefined()

    expect(disconnect).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })
})
