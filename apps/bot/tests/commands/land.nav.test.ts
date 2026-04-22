import { describe, expect, it } from 'vitest'
import { nextOwnedIndex, prevOwnedIndex } from '../../src/utils/landNav'

describe('LandView nav helpers', () => {
  describe('prevOwnedIndex', () => {
    it('returns null at the leftmost owned index', () => {
      expect(prevOwnedIndex([1, 2, 3], 1)).toBeNull()
    })

    it('returns the immediate previous owned index', () => {
      expect(prevOwnedIndex([1, 2, 4, 5], 4)).toBe(2)
      expect(prevOwnedIndex([1, 3], 3)).toBe(1)
    })

    it('returns null if current is below all owned', () => {
      expect(prevOwnedIndex([2, 3, 4], 2)).toBeNull()
    })
  })

  describe('nextOwnedIndex', () => {
    it('returns null at the rightmost owned index', () => {
      expect(nextOwnedIndex([1, 2, 3], 3)).toBeNull()
    })

    it('returns the immediate next owned index', () => {
      expect(nextOwnedIndex([1, 2, 4], 2)).toBe(4)
      expect(nextOwnedIndex([1, 3], 1)).toBe(3)
    })

    it('returns null for indices beyond the max', () => {
      expect(nextOwnedIndex([1, 2, 3], 5)).toBeNull()
    })
  })

  it('round-trips through sparse owned set', () => {
    const owned = [1, 3]
    expect(prevOwnedIndex(owned, 3)).toBe(1)
    expect(nextOwnedIndex(owned, 1)).toBe(3)
    expect(prevOwnedIndex(owned, 1)).toBeNull()
    expect(nextOwnedIndex(owned, 3)).toBeNull()
  })
})
