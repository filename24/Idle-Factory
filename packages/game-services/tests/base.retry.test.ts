/**
 * `runInTx` 재시도 로직 순수 유닛 테스트.
 *
 * DB/Prisma 의존 없음 — `$transaction` 을 mock 해 P2034(write conflict/deadlock)
 * 재시도, 비재시도 에러 즉시 전파, 최대 시도 소진 동작을 검증한다.
 */

import type { PrismaClient } from '@idle/database'
import { describe, expect, it, vi } from 'vitest'
import { runInTx } from '../src/base'

type TxBehavior = 'ok' | 'p2034' | 'p2002' | 'plain'

/** code 를 가진 Prisma 유사 에러 생성. */
function codedError(code: string): Error {
  return Object.assign(new Error(`mock error ${code}`), { code })
}

/**
 * 시도별 동작 시퀀스를 받아 mock PrismaClient 를 만든다.
 * `$transaction(fn)` 은 시퀀스에 따라 던지거나, `ok` 면 fn 을 실제로 실행한다.
 */
function makePrisma(sequence: readonly TxBehavior[]) {
  const $transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
    const idx = $transaction.mock.calls.length - 1
    const behavior = sequence[idx] ?? 'ok'
    switch (behavior) {
      case 'p2034':
        throw codedError('P2034')
      case 'p2002':
        throw codedError('P2002')
      case 'plain':
        throw new Error('no code error')
      default:
        return fn({})
    }
  })
  return { prisma: { $transaction } as unknown as PrismaClient, $transaction }
}

describe('runInTx retry', () => {
  it('첫 시도 성공 시 콜백 결과를 반환하고 재시도하지 않는다', async () => {
    const { prisma, $transaction } = makePrisma(['ok'])
    const result = await runInTx(prisma, async () => 42)
    expect(result).toBe(42)
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('P2034 를 두 번 맞고 세 번째에 성공한다', async () => {
    const { prisma, $transaction } = makePrisma(['p2034', 'p2034', 'ok'])
    const result = await runInTx(prisma, async () => 'done')
    expect(result).toBe('done')
    expect($transaction).toHaveBeenCalledTimes(3)
  })

  it('5회(최대 시도) 모두 P2034 면 마지막 P2034 를 rethrow 한다', async () => {
    const { prisma, $transaction } = makePrisma(['p2034', 'p2034', 'p2034', 'p2034', 'p2034'])
    await expect(runInTx(prisma, async () => 1)).rejects.toMatchObject({
      code: 'P2034',
    })
    expect($transaction).toHaveBeenCalledTimes(5)
  })

  it('비재시도 에러(P2002)는 즉시 전파하고 재시도하지 않는다', async () => {
    const { prisma, $transaction } = makePrisma(['p2002'])
    await expect(runInTx(prisma, async () => 1)).rejects.toMatchObject({
      code: 'P2002',
    })
    expect($transaction).toHaveBeenCalledTimes(1)
  })

  it('code 없는 일반 에러도 재시도하지 않는다', async () => {
    const { prisma, $transaction } = makePrisma(['plain'])
    await expect(runInTx(prisma, async () => 1)).rejects.toThrow('no code error')
    expect($transaction).toHaveBeenCalledTimes(1)
  })
})
