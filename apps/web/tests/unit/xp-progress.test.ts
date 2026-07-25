import { describe, test, expect } from 'vitest'
import { xpRequiredForLevel } from '@idle/game-core'
import { computeXpProgress } from '../../src/lib/xp-progress'

describe('computeXpProgress', () => {
  test('레벨 1: xpRequired=100, 진행률 0%', () => {
    const p = computeXpProgress(1, 0n)
    expect(p.xpRequired).toBe(xpRequiredForLevel(1))
    expect(p.xpRequired).toBe(100n)
    expect(p.xpInLevel).toBe(0n)
    expect(p.xpPercent).toBe(0)
  })

  test('절반 진행 시 50%', () => {
    expect(computeXpProgress(1, 50n).xpPercent).toBe(50)
  })

  test('요구치 도달/초과는 100% 로 clamp', () => {
    expect(computeXpProgress(1, 100n).xpPercent).toBe(100)
    expect(computeXpProgress(1, 250n).xpPercent).toBe(100)
  })

  test('레벨 2 요구 XP 는 game-core 공식과 일치한다', () => {
    const p = computeXpProgress(2, 0n)
    expect(p.xpRequired).toBe(xpRequiredForLevel(2))
    expect(p.xpPercent).toBe(0)
  })
})
