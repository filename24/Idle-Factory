/**
 * `/help` 카탈로그 헬퍼 유닛 테스트.
 *
 * 도움말은 명령 목록을 하드코딩하지 않고 런타임 command store 에서 만들기
 * 때문에, 검증 대상은 "무엇이 보이는가"의 규칙이다:
 *  - owner 만 `dev` 분류를 본다 — 비-owner 가 API 로 `dev` 를 직접 보내도 막힌다
 *  - 슬래시 미지원 피스와 카테고리 없는 피스는 목록에서 빠진다
 *  - 멘션은 글로벌 → 길드 → 코드 스팬 순으로 폴백한다
 *  - 요약문은 로케일 키를 쓰고, 키가 없으면 명령의 영문 description 으로 폴백한다
 */

import { describe, expect, it } from 'vitest'
import {
  commandMention,
  groupCommandsByCategory,
  renderCommandLine,
  resolveVisibleCategories,
  type HelpCatalogCommand
} from '../../src/utils/helpCatalog'

/** 테스트용 최소 명령 객체를 만든다. */
function fakeCommand(
  overrides: Partial<HelpCatalogCommand> & { name: string }
): HelpCatalogCommand {
  return {
    description: `${overrides.name} description`,
    category: 'game',
    supportsChatInputCommands: () => true,
    applicationCommandRegistry: {
      globalChatInputCommandIds: new Set<string>(),
      guildIdToChatInputCommandIds: new Map<string, ReadonlySet<string>>()
    },
    ...overrides
  }
}

describe('resolveVisibleCategories', () => {
  it('hides the dev category from non-owners', () => {
    expect(resolveVisibleCategories(false, null)).toEqual([
      'game',
      'info',
      'settings'
    ])
  })

  it('appends the dev category for owners', () => {
    expect(resolveVisibleCategories(true, null)).toEqual([
      'game',
      'info',
      'settings',
      'dev'
    ])
  })

  it('narrows to the requested category', () => {
    expect(resolveVisibleCategories(false, 'settings')).toEqual(['settings'])
  })

  it('returns empty when a non-owner requests the dev category', () => {
    expect(resolveVisibleCategories(false, 'dev')).toEqual([])
  })

  it('returns empty for an unknown category', () => {
    expect(resolveVisibleCategories(true, 'nope')).toEqual([])
  })
})

describe('groupCommandsByCategory', () => {
  it('groups by category and sorts each bucket by name', () => {
    const grouped = groupCommandsByCategory([
      fakeCommand({ name: 'warehouse' }),
      fakeCommand({ name: 'factory' }),
      fakeCommand({ name: 'ping', category: 'info' })
    ])

    expect([...grouped.keys()]).toEqual(['game', 'info'])
    expect(grouped.get('game')?.map((c) => c.name)).toEqual([
      'factory',
      'warehouse'
    ])
    expect(grouped.get('info')?.map((c) => c.name)).toEqual(['ping'])
  })

  it('skips commands that do not support slash commands', () => {
    const grouped = groupCommandsByCategory([
      fakeCommand({ name: 'context', supportsChatInputCommands: () => false }),
      fakeCommand({ name: 'harvest' })
    ])

    expect(grouped.get('game')?.map((c) => c.name)).toEqual(['harvest'])
  })

  it('skips commands without a category instead of inventing one', () => {
    const grouped = groupCommandsByCategory([
      fakeCommand({ name: 'orphan', category: null }),
      fakeCommand({ name: 'land' })
    ])

    expect(grouped.size).toBe(1)
    expect(grouped.get('game')?.map((c) => c.name)).toEqual(['land'])
  })
})

describe('commandMention', () => {
  it('prefers the global command id', () => {
    const command = fakeCommand({
      name: 'profile',
      applicationCommandRegistry: {
        globalChatInputCommandIds: new Set(['111']),
        guildIdToChatInputCommandIds: new Map([['g1', new Set(['222'])]])
      }
    })

    expect(commandMention(command, 'g1')).toBe('</profile:111>')
  })

  it('falls back to the guild-scoped id', () => {
    const command = fakeCommand({
      name: 'debug',
      category: 'dev',
      applicationCommandRegistry: {
        globalChatInputCommandIds: new Set<string>(),
        guildIdToChatInputCommandIds: new Map([['g1', new Set(['333'])]])
      }
    })

    expect(commandMention(command, 'g1')).toBe('</debug:333>')
  })

  it('falls back to a code span when no id is registered yet', () => {
    expect(commandMention(fakeCommand({ name: 'quest' }), 'g1')).toBe(
      '`/quest`'
    )
  })

  it('falls back to a code span in DMs when only a guild id exists', () => {
    const command = fakeCommand({
      name: 'debug',
      applicationCommandRegistry: {
        globalChatInputCommandIds: new Set<string>(),
        guildIdToChatInputCommandIds: new Map([['g1', new Set(['333'])]])
      }
    })

    expect(commandMention(command, null)).toBe('`/debug`')
  })
})

describe('renderCommandLine', () => {
  it('uses the localized summary when the key exists', () => {
    const translate = (key: string) =>
      key === 'embeds:command.help.entries.harvest'
        ? '모든 공장을 한 번에 수확합니다.'
        : key

    const line = renderCommandLine(
      translate,
      fakeCommand({ name: 'harvest' }),
      null
    )

    expect(line).toBe('`/harvest` — 모든 공장을 한 번에 수확합니다.')
  })

  it("falls back to the command's own description when the key is missing", () => {
    // i18next 는 키가 없으면 defaultValue 를 돌려준다 — 그 동작을 흉내낸다.
    const translate = (_key: string, defaultValue: string) => defaultValue

    const line = renderCommandLine(
      translate,
      fakeCommand({ name: 'newthing', description: 'Brand new command.' }),
      null
    )

    expect(line).toBe('`/newthing` — Brand new command.')
  })
})
