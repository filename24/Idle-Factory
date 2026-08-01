/**
 * 퀘스트 조회 계층의 순수 헬퍼 검증.
 *
 * `getMyQuests` 자체는 Prisma 를 타므로 유닛 범위 밖이다. 대신 DTO 를 만드는
 * 계산 — 진행률과 i18n 키 변환 — 을 분리해 검증한다. 둘 다 회귀하면 화면에
 * 조용히 잘못된 값이 뜨는 종류의 로직이다.
 */

import { describe, expect, it } from 'vitest'
import { QUEST_CATALOG } from '@idle/game-core'
import { computeQuestPercent, toWebMessageKey } from '../../src/lib/queries/quests'
import ko from '../../messages/ko.json'
import en from '../../messages/en.json'

/** `a.b.c` 경로 조회. */
function lookup(catalog: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, key) =>
        node !== null && typeof node === 'object'
          ? (node as Record<string, unknown>)[key]
          : undefined,
      catalog,
    )
}

describe('computeQuestPercent', () => {
  it('경계값을 0·100 으로 고정한다', () => {
    expect(computeQuestPercent(0n, 10n)).toBe(0)
    expect(computeQuestPercent(10n, 10n)).toBe(100)
  })

  it('목표를 넘어도 100 을 넘지 않는다', () => {
    expect(computeQuestPercent(999n, 10n)).toBe(100)
  })

  it('음수 진행도를 0 으로 본다', () => {
    expect(computeQuestPercent(-5n, 10n)).toBe(0)
  })

  it('target 이 0 이면 100 으로 본다', () => {
    // 0 으로 나누면 터진다. 목표가 없는 퀘스트는 이미 달성한 것으로 취급한다.
    expect(computeQuestPercent(0n, 0n)).toBe(100)
    expect(computeQuestPercent(5n, -1n)).toBe(100)
  })

  it('중간값을 정수로 내림한다', () => {
    expect(computeQuestPercent(1n, 3n)).toBe(33)
    expect(computeQuestPercent(2n, 3n)).toBe(66)
    expect(computeQuestPercent(1n, 2n)).toBe(50)
  })

  it('2^53 을 넘는 목표에서도 정밀도를 잃지 않는다', () => {
    // Number 로 먼저 바꿨다면 여기서 어긋난다.
    const target = 10_000_000_000_000_000_000n
    expect(computeQuestPercent(target / 4n, target)).toBe(25)
  })
})

describe('toWebMessageKey', () => {
  it('i18next 네임스페이스 접두를 제거한다', () => {
    expect(toWebMessageKey('game:quest.tutorial.1.title')).toBe('quest.tutorial.1.title')
  })

  it('접두가 없으면 그대로 둔다', () => {
    expect(toWebMessageKey('quest.tutorial.1.title')).toBe('quest.tutorial.1.title')
  })

  it('빈 문자열을 견딘다', () => {
    expect(toWebMessageKey('')).toBe('')
  })
})

describe('퀘스트 카탈로그 ↔ 메시지 카탈로그 정합성', () => {
  it('모든 퀘스트의 제목·설명 키가 ko·en 양쪽에 실재한다', () => {
    // 봇 카탈로그에 퀘스트가 추가됐는데 웹 메시지를 안 넣으면 화면에 키 문자열이
    // 그대로 노출된다. 그걸 여기서 잡는다.
    for (const def of Object.values(QUEST_CATALOG)) {
      for (const rawKey of [def.title, def.description]) {
        const key = toWebMessageKey(rawKey)
        expect(lookup(ko, key), `ko: ${key}`).toBeTypeOf('string')
        expect(lookup(en, key), `en: ${key}`).toBeTypeOf('string')
      }
    }
  })

  it('튜토리얼 체인이 비어 있지 않다', () => {
    const tutorial = Object.values(QUEST_CATALOG).filter((d) => d.chain?.name === 'tutorial')
    expect(tutorial.length).toBeGreaterThan(0)
  })
})
