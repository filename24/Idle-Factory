import { describe, expect, it } from 'vitest'
import {
  getNextInChain,
  getQuestDef,
  QUEST_CATALOG,
  validateChainIntegrity,
  type QuestDef,
} from '../src/quests'

describe('catalog integrity', () => {
  it('every chain.next references an existing questId', () => {
    const report = validateChainIntegrity(QUEST_CATALOG)
    expect(report.danglingNexts).toEqual([])
  })

  it('chain graph has no cycles', () => {
    const report = validateChainIntegrity(QUEST_CATALOG)
    expect(report.cycles).toEqual([])
  })

  it('tutorial chain has 5 nodes ordered 1..5', () => {
    const tutorialQuests = Object.values(QUEST_CATALOG)
      .filter((q) => q.chain?.name === 'tutorial')
      .sort((a, b) => (a.chain?.order ?? 0) - (b.chain?.order ?? 0))
    expect(tutorialQuests.map((q) => q.id)).toEqual([
      'tutorial.1',
      'tutorial.2',
      'tutorial.3',
      'tutorial.4',
      'tutorial.5',
    ])
  })

  it('tutorial.5 is terminal (no chain.next)', () => {
    expect(QUEST_CATALOG['tutorial.5']?.chain?.next).toBeUndefined()
  })

  it('all rewards use bigint amounts', () => {
    for (const def of Object.values(QUEST_CATALOG)) {
      for (const r of def.rewards) {
        expect(typeof r.amount).toBe('bigint')
      }
    }
  })
})

describe('getNextInChain', () => {
  it('returns the next node for tutorial.1', () => {
    const next = getNextInChain(QUEST_CATALOG, 'tutorial.1')
    expect(next?.id).toBe('tutorial.2')
  })

  it('returns null for terminal node tutorial.5', () => {
    expect(getNextInChain(QUEST_CATALOG, 'tutorial.5')).toBeNull()
  })

  it('returns null for nonexistent questId', () => {
    expect(getNextInChain(QUEST_CATALOG, 'no.such.quest')).toBeNull()
  })

  it('returns null when next pointer is dangling', () => {
    const broken: Record<string, QuestDef> = {
      a: {
        id: 'a',
        kind: 'TUTORIAL',
        chain: { name: 'x', order: 1, next: 'missing' },
        title: 't',
        description: 'd',
        target: 1n,
        rewards: [],
        trigger: { kind: 'FACTORY_HARVESTED' },
      },
    }
    expect(getNextInChain(broken, 'a')).toBeNull()
  })
})

describe('validateChainIntegrity', () => {
  it('detects dangling next', () => {
    const broken: Record<string, QuestDef> = {
      a: {
        id: 'a',
        kind: 'TUTORIAL',
        chain: { name: 'x', order: 1, next: 'missing' },
        title: 't',
        description: 'd',
        target: 1n,
        rewards: [],
        trigger: { kind: 'FACTORY_HARVESTED' },
      },
    }
    const report = validateChainIntegrity(broken)
    expect(report.danglingNexts).toEqual(['a'])
  })

  it('detects cycles', () => {
    const cyclic: Record<string, QuestDef> = {
      a: {
        id: 'a',
        kind: 'TUTORIAL',
        chain: { name: 'x', order: 1, next: 'b' },
        title: 't',
        description: 'd',
        target: 1n,
        rewards: [],
        trigger: { kind: 'FACTORY_HARVESTED' },
      },
      b: {
        id: 'b',
        kind: 'TUTORIAL',
        chain: { name: 'x', order: 2, next: 'a' },
        title: 't',
        description: 'd',
        target: 1n,
        rewards: [],
        trigger: { kind: 'FACTORY_HARVESTED' },
      },
    }
    const report = validateChainIntegrity(cyclic)
    expect(report.cycles.length).toBeGreaterThan(0)
  })
})

describe('getQuestDef', () => {
  it('returns the def for known id', () => {
    expect(getQuestDef('tutorial.1')?.id).toBe('tutorial.1')
  })

  it('returns null for unknown id', () => {
    expect(getQuestDef('does-not-exist')).toBeNull()
  })
})
