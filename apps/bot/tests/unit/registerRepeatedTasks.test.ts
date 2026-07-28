import { describe, test, expect, vi } from 'vitest'
import { registerRepeatedTasks } from '../../src/utils/registerRepeatedTasks'

/**
 * 반복 작업 등록 경로 검증.
 *
 * 회귀 근거: 이 호출이 통째로 빠져 있어 ScheduledTask 7개가 store 에는 로드되고도
 * 스케줄이 전혀 돌지 않았다. 에러가 나지 않는 실패라 로그로도 드러나지 않았다.
 */
const makeLogger = () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
})

describe('registerRepeatedTasks', () => {
  test('반복 task 가 있으면 createRepeated 를 호출한다', async () => {
    const createRepeated = vi.fn().mockResolvedValue(undefined)
    const logger = makeLogger()

    const result = await registerRepeatedTasks({
      repeatedCount: 7,
      createRepeated,
      logger
    })

    expect(result).toBe('registered')
    expect(createRepeated).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('7개'))
  })

  test('반복 task 가 없으면 호출하지 않고 경고만 남긴다', async () => {
    // build/scheduled-tasks 가 비는 사고(엔트리 누락)를 로그로 드러내기 위함.
    const createRepeated = vi.fn()
    const logger = makeLogger()

    const result = await registerRepeatedTasks({
      repeatedCount: 0,
      createRepeated,
      logger
    })

    expect(result).toBe('empty')
    expect(createRepeated).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalledOnce()
  })

  test('등록이 실패해도 던지지 않고 에러를 남긴다', async () => {
    // Redis 가 죽었다고 봇 전체가 부팅에 실패하면 안 된다.
    const createRepeated = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const logger = makeLogger()

    const result = await registerRepeatedTasks({
      repeatedCount: 3,
      createRepeated,
      logger
    })

    expect(result).toBe('failed')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ECONNREFUSED')
    )
  })
})
