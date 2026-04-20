import { describe, expect, it } from 'vitest'
import { GAME_CORE_VERSION } from '../src/index'

describe('game-core smoke', () => {
  it('exports a version string', () => {
    expect(GAME_CORE_VERSION).toBe('1.0.0')
  })
})
