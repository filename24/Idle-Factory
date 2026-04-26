import { describe, expect, it } from 'vitest'
import { applyXp, xpForEvent, xpRequiredForLevel } from '../src/xp/level'

describe('xpRequiredForLevel', () => {
  it('returns 100 for level 1', () => {
    expect(xpRequiredForLevel(1)).toBe(100n)
  })

  it('returns ~459 for level 2', () => {
    const v = xpRequiredForLevel(2)
    expect(v).toBe(BigInt(Math.floor(100 * Math.pow(2, 2.2))))
    expect(v >= 455n && v <= 465n).toBe(true)
  })

  it('returns formula result for level 5', () => {
    const v = xpRequiredForLevel(5)
    expect(v).toBe(BigInt(Math.floor(100 * Math.pow(5, 2.2))))
    expect(v >= 3400n && v <= 3460n).toBe(true)
  })

  it('returns ~15848 for level 10', () => {
    const v = xpRequiredForLevel(10)
    expect(v >= 15840n && v <= 15860n).toBe(true)
  })

  it('throws on level 0', () => {
    expect(() => xpRequiredForLevel(0)).toThrow(RangeError)
  })

  it('throws on negative level', () => {
    expect(() => xpRequiredForLevel(-1)).toThrow(RangeError)
  })

  it('throws on non-integer level', () => {
    expect(() => xpRequiredForLevel(1.5)).toThrow(RangeError)
  })
})

describe('xpForEvent', () => {
  it('tick production scales by ticks', () => {
    expect(xpForEvent({ kind: 'TICK_PRODUCTION', ticks: 3 })).toBe(15n)
  })

  it('market sell default count 1', () => {
    expect(xpForEvent({ kind: 'MARKET_SELL' })).toBe(20n)
  })

  it('market sell scales by count', () => {
    expect(xpForEvent({ kind: 'MARKET_SELL', count: 5 })).toBe(100n)
  })

  it('user trade default and scaled', () => {
    expect(xpForEvent({ kind: 'USER_TRADE' })).toBe(15n)
    expect(xpForEvent({ kind: 'USER_TRADE', count: 4 })).toBe(60n)
  })

  it('stock realize default and scaled', () => {
    expect(xpForEvent({ kind: 'STOCK_REALIZE' })).toBe(10n)
    expect(xpForEvent({ kind: 'STOCK_REALIZE', count: 7 })).toBe(70n)
  })

  it('build caps at 1000', () => {
    expect(xpForEvent({ kind: 'BUILD', cost: 1_000_000n })).toBe(1000n)
  })

  it('build linear below cap', () => {
    expect(xpForEvent({ kind: 'BUILD', cost: 50_000n })).toBe(50n)
  })

  it('upgrade caps at 1000 for huge costs', () => {
    expect(xpForEvent({ kind: 'UPGRADE', cost: 999_999_999n })).toBe(1000n)
  })

  it('upgrade linear below cap', () => {
    expect(xpForEvent({ kind: 'UPGRADE', cost: 25_000n })).toBe(25n)
  })
})

describe('applyXp', () => {
  it('accumulates without level up', () => {
    const r = applyXp({ level: 1, xpInLevel: 50n }, 30n)
    expect(r.progress.level).toBe(1)
    expect(r.progress.xpInLevel).toBe(80n)
    expect(r.leveledUp).toBe(false)
    expect(r.levelsGained).toBe(0)
  })

  it('levels up exactly once', () => {
    const r = applyXp({ level: 1, xpInLevel: 0n }, 100n)
    expect(r.progress.level).toBe(2)
    expect(r.progress.xpInLevel).toBe(0n)
    expect(r.levelsGained).toBe(1)
    expect(r.leveledUp).toBe(true)
  })

  it('can level up with overflow within bounds', () => {
    const r = applyXp({ level: 1, xpInLevel: 0n }, 600n)
    expect(r.progress.level).toBeGreaterThanOrEqual(2)
    const req = xpRequiredForLevel(r.progress.level)
    expect(r.progress.xpInLevel >= 0n).toBe(true)
    expect(r.progress.xpInLevel < req).toBe(true)
  })

  it('handles large xp delta across many levels', () => {
    const r = applyXp({ level: 1, xpInLevel: 0n }, 10_000n)
    expect(r.progress.level).toBeGreaterThanOrEqual(5)
    expect(r.levelsGained).toBeGreaterThanOrEqual(4)
    const req = xpRequiredForLevel(r.progress.level)
    expect(r.progress.xpInLevel < req).toBe(true)
    expect(r.progress.xpInLevel >= 0n).toBe(true)
  })
})
