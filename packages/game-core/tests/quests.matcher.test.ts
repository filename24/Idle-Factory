import { describe, expect, it } from 'vitest'
import { matchEvent, QUEST_CATALOG, type QuestDef, type QuestEvent } from '../src/quests'

const Q1 = QUEST_CATALOG['tutorial.1']! // FACTORY_BUILT, T1
const Q2 = QUEST_CATALOG['tutorial.2']! // FACTORY_HARVESTED
const Q3 = QUEST_CATALOG['tutorial.3']! // MARKET_LISTED
const Q4 = QUEST_CATALOG['tutorial.4']! // FACTORY_UPGRADED, minToGrade=2
const Q5 = QUEST_CATALOG['tutorial.5']! // FACTORY_BUILT, T1, minTotal=2n

describe('matchEvent — FACTORY_BUILT', () => {
  it('matches when tier matches', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'FARM',
      ownedAfter: 1,
    }
    expect(matchEvent(Q1, event)).toEqual({ matched: true, increment: 1n })
  })

  it('does not match when tier differs', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T2',
      type: 'STEEL_MILL',
      ownedAfter: 1,
    }
    expect(matchEvent(Q1, event)).toEqual({ matched: false, increment: 0n })
  })

  it('Q5 minTotal: 1 owned → no match', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'FARM',
      ownedAfter: 1,
    }
    expect(matchEvent(Q5, event)).toEqual({ matched: false, increment: 0n })
  })

  it('Q5 minTotal: 2 owned → match', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'MINE',
      ownedAfter: 2,
    }
    expect(matchEvent(Q5, event)).toEqual({ matched: true, increment: 1n })
  })

  it('event with different kind never matches', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_HARVESTED',
      factoryIds: ['f1'],
      tickTotal: 3,
    }
    expect(matchEvent(Q1, event)).toEqual({ matched: false, increment: 0n })
  })

  it('respects type filter when specified', () => {
    const def: QuestDef = {
      ...Q1,
      id: 'test',
      trigger: { kind: 'FACTORY_BUILT', type: 'FARM' },
    }
    const farm: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'FARM',
      ownedAfter: 1,
    }
    const mine: QuestEvent = {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'MINE',
      ownedAfter: 1,
    }
    expect(matchEvent(def, farm).matched).toBe(true)
    expect(matchEvent(def, mine).matched).toBe(false)
  })
})

describe('matchEvent — FACTORY_HARVESTED', () => {
  it('matches any harvest event', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_HARVESTED',
      factoryIds: ['f1'],
      tickTotal: 1,
    }
    expect(matchEvent(Q2, event)).toEqual({ matched: true, increment: 1n })
  })
})

describe('matchEvent — FACTORY_UPGRADED', () => {
  it('Q4 fromGrade=1 toGrade=2 → match', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_UPGRADED',
      fromGrade: 1,
      toGrade: 2,
      type: 'FARM',
    }
    expect(matchEvent(Q4, event)).toEqual({ matched: true, increment: 1n })
  })

  it('Q4 toGrade=1 (no upgrade) → no match', () => {
    // 이론상 toGrade 가 1인 upgrade 는 발생할 수 없지만 minToGrade 가드 검증.
    const event: QuestEvent = {
      kind: 'FACTORY_UPGRADED',
      fromGrade: 0,
      toGrade: 1,
      type: 'FARM',
    }
    expect(matchEvent(Q4, event)).toEqual({ matched: false, increment: 0n })
  })

  it('Q4 toGrade=5 (above threshold) → match', () => {
    const event: QuestEvent = {
      kind: 'FACTORY_UPGRADED',
      fromGrade: 4,
      toGrade: 5,
      type: 'STEEL_MILL',
    }
    expect(matchEvent(Q4, event)).toEqual({ matched: true, increment: 1n })
  })
})

describe('matchEvent — MARKET_LISTED', () => {
  it('Q3 any material → match with quantity as increment', () => {
    const event: QuestEvent = {
      kind: 'MARKET_LISTED',
      material: 'GRAIN',
      quantity: 10n,
      pricePerUnit: 12n,
    }
    expect(matchEvent(Q3, event)).toEqual({ matched: true, increment: 10n })
  })

  it('respects material filter when specified', () => {
    const def: QuestDef = {
      ...Q3,
      id: 'test',
      trigger: { kind: 'MARKET_LISTED', material: 'ORE' },
    }
    const grain: QuestEvent = {
      kind: 'MARKET_LISTED',
      material: 'GRAIN',
      quantity: 5n,
      pricePerUnit: 10n,
    }
    const ore: QuestEvent = {
      kind: 'MARKET_LISTED',
      material: 'ORE',
      quantity: 5n,
      pricePerUnit: 25n,
    }
    expect(matchEvent(def, grain).matched).toBe(false)
    expect(matchEvent(def, ore)).toEqual({ matched: true, increment: 5n })
  })
})

describe('matchEvent — WAREHOUSE_UPGRADED', () => {
  it('matches when toGrade meets threshold', () => {
    const def: QuestDef = {
      id: 'test',
      kind: 'ACHIEVEMENT',
      title: 't',
      description: 'd',
      target: 1n,
      rewards: [],
      trigger: { kind: 'WAREHOUSE_UPGRADED', minToGrade: 3 },
    }
    const ev: QuestEvent = { kind: 'WAREHOUSE_UPGRADED', toGrade: 3 }
    expect(matchEvent(def, ev).matched).toBe(true)
  })

  it('no minToGrade → matches any upgrade', () => {
    const def: QuestDef = {
      id: 'test',
      kind: 'ACHIEVEMENT',
      title: 't',
      description: 'd',
      target: 1n,
      rewards: [],
      trigger: { kind: 'WAREHOUSE_UPGRADED' },
    }
    const ev: QuestEvent = { kind: 'WAREHOUSE_UPGRADED', toGrade: 2 }
    expect(matchEvent(def, ev)).toEqual({ matched: true, increment: 1n })
  })

  it('minToGrade unmet → no match', () => {
    const def: QuestDef = {
      id: 'test',
      kind: 'ACHIEVEMENT',
      title: 't',
      description: 'd',
      target: 1n,
      rewards: [],
      trigger: { kind: 'WAREHOUSE_UPGRADED', minToGrade: 5 },
    }
    const ev: QuestEvent = { kind: 'WAREHOUSE_UPGRADED', toGrade: 4 }
    expect(matchEvent(def, ev).matched).toBe(false)
  })

  it('Q5 는 한 번의 매칭으로 완료된다 — minTotal 과 target 이 중복되지 않는다 (#21)', () => {
    // target 을 2 로 두면 "2채 보유 상태에서 2번 더 건설"(총 3채)이 되어
    // i18n 문구("T1 공장을 2개 보유하세요")와 어긋난다.
    expect(Q5.target).toBe(1n)
    const result = matchEvent(Q5, {
      kind: 'FACTORY_BUILT',
      tier: 'T1',
      type: 'FARM',
      ownedAfter: 2,
    })
    expect(result.matched).toBe(true)
    expect(result.matched && result.increment >= Q5.target).toBe(true)
  })
})
