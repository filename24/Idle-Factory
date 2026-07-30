/**
 * 언어 도메인 — 지원 로케일 목록·표시 라벨·i18next 언어 결정 리졸버.
 *
 * `@sapphire/plugin-i18next` 는 `fetchLanguage` 옵션이 없으면 기본 구현
 * `() => null` 을 쓰고, 최종 언어는 `guild.preferredLocale ?? defaultName ??
 * 'en-US'` 로만 결정된다. 즉 DB 의 `User.lang` / `Guild.lang` 은 저장만 되고
 * 번역에는 전혀 반영되지 않는다.
 *
 * 이 모듈은 그 빠진 연결 고리를 채운다. `config.ts` 의 `i18n.options.fetchLanguage`
 * 에 등록되어 매 응답의 언어를 다음 우선순위로 정한다:
 *
 *   1. `User.lang` — 유저가 직접 고른 언어 (`'auto'` 면 건너뜀)
 *   2. `Guild.lang` — 서버 관리자가 고른 언어
 *   3. `interactionLocale` — 유저의 디스코드 클라이언트 언어
 *   4. `null` — 플러그인 기본값(`guild.preferredLocale`)에 위임
 *
 * 명시적 선택이 암묵적 추론을 이기고, 개인 설정이 서버 설정을 이긴다.
 *
 * 번역 언어 결정은 모든 응답의 전제 조건이므로 DB 장애가 응답 자체를 막아서는
 * 안 된다. 조회 실패는 로그를 남기고 다음 순위로 폴백한다.
 */

import { container } from '@sapphire/pieces'
import type { PrismaClient } from '@idle/database'
import type { InternationalizationContext } from '@sapphire/plugin-i18next'
import { USER_SETTINGS_LANG_PREFIX } from './Constants'

/**
 * 봇이 실제로 번역 리소스를 갖고 있는 로케일 목록.
 *
 * `src/locales/<lng>/` 디렉터리와 1:1 로 대응한다. 새 언어를 추가하려면 로케일
 * 디렉터리와 이 배열을 함께 늘려야 하며, 디스코드가 인식하는 로케일 코드여야
 * 한다(플러그인이 미지원 코드에 `UNSUPPORTED_LOCALE` 경고를 낸다).
 */
export const SUPPORTED_LANGUAGES = ['ko', 'en-US'] as const

/** {@link SUPPORTED_LANGUAGES} 의 원소 타입. */
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

/**
 * "서버 설정을 따름"을 뜻하는 `User.lang` 센티널.
 *
 * 개인 언어를 지정하지 않은 상태를 구체 로케일과 구분하기 위해 쓴다. 이 값이면
 * 우선순위 1단계를 건너뛰고 길드 설정으로 내려간다.
 */
export const LANG_AUTO = 'auto'

/**
 * 언어 선택 UI 에 노출할 표시 이름.
 *
 * 각 언어를 **그 언어 자체로** 적는다(endonym). 현재 표시 언어가 무엇이든
 * 자기 언어를 알아볼 수 있어야 하므로 번역 리소스로 빼지 않는다.
 */
export const LANGUAGE_LABELS: Readonly<Record<SupportedLanguage, string>> = {
  ko: '한국어',
  'en-US': 'English'
}

/**
 * 값이 번역 리소스를 가진 지원 로케일인지 판별한다.
 *
 * DB 에 남아 있는 과거 값이나 디스코드가 보내는 미지원 로케일(`fr`, `ja` 등)을
 * 걸러내는 경계 검증 지점이다. {@link LANG_AUTO} 는 로케일이 아니므로 false.
 *
 * @param value 검사할 값 (DB 컬럼·인터랙션 로케일 등 신뢰할 수 없는 입력)
 */
export function isSupportedLanguage(
  value: unknown
): value is SupportedLanguage {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  )
}

/**
 * `lang` 한 컬럼을 읽되, 실패해도 throw 하지 않고 `null` 로 흡수한다.
 *
 * @param read 실제 조회를 수행하는 thunk
 * @param scope 로그용 스코프 라벨 (`user` | `guild`)
 * @param id 로그용 대상 snowflake
 */
async function safeReadLang(
  read: () => Promise<{ lang: string } | null>,
  scope: string,
  id: string
): Promise<string | null> {
  try {
    const row = await read()
    return row?.lang ?? null
  } catch (error) {
    container.logger?.warn(
      `[i18n] ${scope} ${id} 언어 조회 실패 — 다음 순위로 폴백: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
    return null
  }
}

/**
 * 인터랙션 컨텍스트로부터 사용할 번역 언어를 결정한다.
 *
 * 모듈 주석의 4단계 우선순위를 그대로 구현한다. 유저·길드 조회는 서로 독립이라
 * 병렬로 던져 왕복 1회로 끝낸다.
 *
 * @param db Prisma 클라이언트 (`container.db`)
 * @param context 플러그인이 넘겨주는 i18n 컨텍스트
 * @returns 채택한 로케일. 아무것도 해석되지 않으면 `null` (플러그인 기본값 사용)
 */
export async function resolveLanguage(
  db: PrismaClient,
  context: InternationalizationContext
): Promise<string | null> {
  const { user, guild } = context

  const [userLang, guildLang] = await Promise.all([
    user
      ? safeReadLang(
          () =>
            db.user.findUnique({
              where: { id: user.id },
              select: { lang: true }
            }),
          'user',
          user.id
        )
      : Promise.resolve(null),
    guild
      ? safeReadLang(
          () =>
            db.guild.findUnique({
              where: { id: guild.id },
              select: { lang: true }
            }),
          'guild',
          guild.id
        )
      : Promise.resolve(null)
  ])

  if (isSupportedLanguage(userLang)) return userLang
  if (isSupportedLanguage(guildLang)) return guildLang

  const { interactionLocale } = context
  if (isSupportedLanguage(interactionLocale)) return interactionLocale

  return null
}

/** {@link parseUserLanguageSelection} 결과 — 패널 소유자와 고른 값. */
export interface UserLanguageSelection {
  /** customId 에 박혀 있던 패널 소유자 snowflake. */
  readonly userId: string
  /** 고른 값 — `'auto'` 또는 지원 로케일. */
  readonly lang: string
}

/**
 * 개인 언어 select 의 customId·선택값을 검증해 파싱한다.
 *
 * Sapphire 의 store 디렉터리에는 piece 만 둘 수 있어(`apps/bot/AGENTS.md`)
 * 핸들러의 순수 판별 로직은 여기로 뺀다. 신뢰할 수 없는 입력을 다루는 경계이므로
 * 세 가지를 모두 확인한다:
 *
 *  - prefix 가 개인 언어 select 의 것인지
 *  - 소유자 id 가 snowflake 형태인지 — 임의 문자열이 들어오면 뒤의 권한 비교가
 *    무의미해진다
 *  - 고른 값이 저장 가능한 값인지
 *
 * 소유자 **본인 여부** 비교는 인터랙션이 있어야 하므로 호출부(핸들러)가 맡는다.
 *
 * @param customId select 의 customId
 * @param value 선택된 값 (`interaction.values[0]`, 없을 수 있음)
 * @returns 파싱 결과. 하나라도 어긋나면 `null`
 */
export function parseUserLanguageSelection(
  customId: string,
  value: string | undefined
): UserLanguageSelection | null {
  if (!customId.startsWith(USER_SETTINGS_LANG_PREFIX)) return null

  const userId = customId.slice(USER_SETTINGS_LANG_PREFIX.length)
  if (!/^\d{5,25}$/.test(userId)) return null

  if (value !== LANG_AUTO && !isSupportedLanguage(value)) return null

  return { userId, lang: value }
}

/**
 * `config.i18n.options.fetchLanguage` 에 그대로 꽂을 수 있는 리졸버를 만든다.
 *
 * `config.ts` 는 `BotClient` 가 `container.db` 를 채우기 **전에** 평가되므로,
 * DB 핸들을 모듈 로드 시점에 캡처하면 영원히 `undefined` 를 붙들게 된다.
 * 그래서 매 호출마다 컨테이너를 다시 읽는다. 부팅 직후처럼 아직 DB 가 없는
 * 순간에는 `null` 을 돌려 플러그인 기본값으로 넘긴다.
 */
export function createLanguageFetcher(): (
  context: InternationalizationContext
) => Promise<string | null> {
  return (context) => {
    const db: PrismaClient | undefined = container.db
    if (!db) return Promise.resolve(null)
    return resolveLanguage(db, context)
  }
}
