/**
 * 언어 도메인 모듈(`utils/language`) 유닛 테스트.
 *
 * `@sapphire/plugin-i18next` 는 `fetchLanguage` 가 미등록이면 기본값 `() => null`
 * 을 쓰고, 그 결과 언어는 `guild.preferredLocale` 로만 결정된다. 즉 DB 에 저장된
 * `User.lang` / `Guild.lang` 이 번역에 전혀 반영되지 않는다.
 *
 * 이 테스트는 그 연결 고리인 순수 리졸버의 우선순위를 고정한다:
 *   User.lang(명시) > Guild.lang(관리자) > interactionLocale > null(플러그인 기본)
 *
 * Prisma 는 목으로 대체하므로 DB 없이 돌아간다.
 */

import { container } from '@sapphire/pieces'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LANG_AUTO,
  SUPPORTED_LANGUAGES,
  createLanguageFetcher,
  isSupportedLanguage,
  parseUserLanguageSelection,
  resolveLanguage
} from '../../src/utils/language'

type LangRow = { lang: string } | null

/** `PrismaClient` 중 리졸버가 실제로 쓰는 두 메서드만 흉내 내는 목. */
function createDb(user: LangRow, guild: LangRow) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    guild: { findUnique: vi.fn().mockResolvedValue(guild) }
  }
}

/** `InternationalizationContext` 중 리졸버가 읽는 필드만 담은 최소 컨텍스트. */
function createContext(
  overrides: Record<string, unknown> = {}
): Parameters<typeof resolveLanguage>[1] {
  return {
    guild: { id: '222222222222222222' },
    channel: null,
    user: { id: '111111111111111111' },
    ...overrides
  } as Parameters<typeof resolveLanguage>[1]
}

describe('SUPPORTED_LANGUAGES', () => {
  it('src/locales 디렉터리와 동일한 두 로케일만 노출한다', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['ko', 'en-US'])
  })
})

describe('isSupportedLanguage', () => {
  it('지원 로케일에만 true 를 반환한다', () => {
    expect(isSupportedLanguage('ko')).toBe(true)
    expect(isSupportedLanguage('en-US')).toBe(true)
  })

  it('미지원 값·센티널·비문자열에는 false 를 반환한다', () => {
    expect(isSupportedLanguage('fr')).toBe(false)
    expect(isSupportedLanguage(LANG_AUTO)).toBe(false)
    expect(isSupportedLanguage('')).toBe(false)
    expect(isSupportedLanguage(null)).toBe(false)
    expect(isSupportedLanguage(undefined)).toBe(false)
    expect(isSupportedLanguage(42)).toBe(false)
  })
})

describe('resolveLanguage — 우선순위', () => {
  it('유저가 명시적으로 고른 언어가 길드 설정을 이긴다', async () => {
    const db = createDb({ lang: 'en-US' }, { lang: 'ko' })

    const result = await resolveLanguage(db as never, createContext())

    expect(result).toBe('en-US')
  })

  it("유저가 'auto' 면 길드 설정을 따른다", async () => {
    const db = createDb({ lang: LANG_AUTO }, { lang: 'en-US' })

    const result = await resolveLanguage(db as never, createContext())

    expect(result).toBe('en-US')
  })

  it('유저 row 가 아직 없으면 길드 설정을 따른다', async () => {
    const db = createDb(null, { lang: 'ko' })

    const result = await resolveLanguage(db as never, createContext())

    expect(result).toBe('ko')
  })

  it('유저·길드 모두 해석 불가면 interactionLocale 로 떨어진다', async () => {
    const db = createDb({ lang: LANG_AUTO }, null)

    const result = await resolveLanguage(
      db as never,
      createContext({ interactionLocale: 'ko' })
    )

    expect(result).toBe('ko')
  })

  it('어느 것도 해석되지 않으면 null 을 반환해 플러그인 기본값에 위임한다', async () => {
    const db = createDb(null, null)

    const result = await resolveLanguage(db as never, createContext())

    expect(result).toBeNull()
  })

  it('DB 에 미지원 로케일이 저장돼 있으면 무시하고 다음 순위로 넘어간다', async () => {
    const db = createDb({ lang: 'fr' }, { lang: 'ko' })

    const result = await resolveLanguage(db as never, createContext())

    expect(result).toBe('ko')
  })

  it('미지원 interactionLocale 은 채택하지 않는다', async () => {
    const db = createDb(null, null)

    const result = await resolveLanguage(
      db as never,
      createContext({ interactionLocale: 'fr' })
    )

    expect(result).toBeNull()
  })
})

describe('resolveLanguage — 조회 최소화', () => {
  it('user 가 없는 컨텍스트(DM 아님/시스템 이벤트)에서는 user 를 조회하지 않는다', async () => {
    const db = createDb(null, { lang: 'ko' })

    const result = await resolveLanguage(
      db as never,
      createContext({ user: null })
    )

    expect(result).toBe('ko')
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })

  it('guild 가 없는 컨텍스트(DM)에서는 guild 를 조회하지 않는다', async () => {
    const db = createDb({ lang: 'en-US' }, null)

    const result = await resolveLanguage(
      db as never,
      createContext({ guild: null })
    )

    expect(result).toBe('en-US')
    expect(db.guild.findUnique).not.toHaveBeenCalled()
  })

  it('discord id 로 각 row 를 조회한다', async () => {
    const db = createDb({ lang: LANG_AUTO }, { lang: 'ko' })

    await resolveLanguage(db as never, createContext())

    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: '111111111111111111' },
      select: { lang: true }
    })
    expect(db.guild.findUnique).toHaveBeenCalledWith({
      where: { id: '222222222222222222' },
      select: { lang: true }
    })
  })
})

describe('resolveLanguage — 장애 내성', () => {
  it('DB 조회가 실패해도 throw 하지 않고 null 을 반환한다', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockRejectedValue(new Error('connection refused'))
      },
      guild: {
        findUnique: vi.fn().mockRejectedValue(new Error('connection refused'))
      }
    }

    await expect(
      resolveLanguage(db as never, createContext())
    ).resolves.toBeNull()
  })

  it('유저 조회만 실패하면 길드 설정으로 복구한다', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockRejectedValue(new Error('boom'))
      },
      guild: { findUnique: vi.fn().mockResolvedValue({ lang: 'en-US' }) }
    }

    await expect(resolveLanguage(db as never, createContext())).resolves.toBe(
      'en-US'
    )
  })
})

describe('parseUserLanguageSelection', () => {
  const OWNER = '111111111111111111'

  it('소유자 id 와 선택값을 뽑아낸다', () => {
    expect(
      parseUserLanguageSelection(`user:settings:lang:${OWNER}`, 'en-US')
    ).toEqual({ userId: OWNER, lang: 'en-US' })
  })

  it("'auto' 선택도 받아들인다", () => {
    expect(
      parseUserLanguageSelection(`user:settings:lang:${OWNER}`, LANG_AUTO)
    ).toEqual({ userId: OWNER, lang: LANG_AUTO })
  })

  it('다른 prefix 의 customId 는 무시한다', () => {
    expect(
      parseUserLanguageSelection(`guild:settings:lang:${OWNER}`, 'ko')
    ).toBeNull()
    expect(parseUserLanguageSelection('user:settings:tax:1', 'ko')).toBeNull()
  })

  it('snowflake 형태가 아닌 소유자 id 는 거부한다', () => {
    expect(
      parseUserLanguageSelection('user:settings:lang:abc', 'ko')
    ).toBeNull()
    expect(parseUserLanguageSelection('user:settings:lang:', 'ko')).toBeNull()
    expect(parseUserLanguageSelection('user:settings:lang:12', 'ko')).toBeNull()
  })

  it('지원하지 않는 선택값은 거부한다', () => {
    expect(
      parseUserLanguageSelection(`user:settings:lang:${OWNER}`, 'fr')
    ).toBeNull()
    expect(
      parseUserLanguageSelection(`user:settings:lang:${OWNER}`, undefined)
    ).toBeNull()
    expect(
      parseUserLanguageSelection(`user:settings:lang:${OWNER}`, '')
    ).toBeNull()
  })
})

describe('createLanguageFetcher', () => {
  afterEach(() => {
    Reflect.deleteProperty(container, 'db')
  })

  it('모듈 로드 시점이 아니라 호출 시점에 container.db 를 읽는다', async () => {
    // config.ts 는 BotClient 가 container.db 를 채우기 전에 평가된다.
    // 여기서 db 를 미리 캡처하면 프로덕션에서 undefined 를 붙들게 된다.
    const fetchLanguage = createLanguageFetcher()

    container.db = createDb({ lang: 'en-US' }, null) as never

    await expect(fetchLanguage(createContext())).resolves.toBe('en-US')
  })

  it('container.db 가 아직 없으면 throw 하지 않고 null 을 반환한다', async () => {
    const fetchLanguage = createLanguageFetcher()

    await expect(fetchLanguage(createContext())).resolves.toBeNull()
  })
})
