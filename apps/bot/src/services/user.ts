/**
 * 유저 서비스 — 봇 전용 부분만 남은 얇은 층.
 *
 * 계정 생성·토지 시드 같은 공용 로직은 `@idle/game-services` 로 이관했다.
 * `updateLang` 만 여기 남는데, 지원 로케일 판정이 봇의 i18next 리소스 목록
 * (`utils/language.ts`)에 묶여 있기 때문이다. 웹은 로케일 목록이 따로이므로
 * (`ko`/`en` vs 봇의 `ko`/`en-US`) 이 함수를 공유해서는 안 된다.
 */

import type { PrismaClient, User } from '@idle/database'
import {
  ServiceError,
  UserService as CoreUserService,
  type EnsureUserInput,
  type HydratedUser
} from '@idle/game-services'
import { LANG_AUTO, isSupportedLanguage } from '../utils/language'

export { createLandWithSlots } from '@idle/game-services'
export type { EnsureUserInput, HydratedUser }

/** `updateLang` 반환 타입 — Prisma 의 User row 그대로. */
export type UserLangRow = User

export const UserService = {
  ...CoreUserService,

  /**
   * 유저 개인 언어 설정을 변경한다.
   *
   * 허용값은 `'auto'`(서버 설정 따름) 또는 번역 리소스가 존재하는 로케일뿐이다.
   * 그 밖의 값은 `utils/language` 리졸버가 조용히 건너뛰기 때문에, 저장까지
   * 허용하면 "설정은 바뀌었는데 언어는 안 바뀌는" 상태가 된다 — 쓰기 경계에서
   * 막는 이유다. 검증은 존재 확인보다 먼저 수행한다.
   *
   * @param prisma Prisma 클라이언트
   * @param discordId 대상 유저 snowflake
   * @param lang `'auto'` 또는 지원 로케일
   * @throws {ServiceError} `UNSUPPORTED_LANGUAGE` — 허용되지 않는 값
   * @throws {ServiceError} `USER_NOT_FOUND` — 유저 row 없음
   */
  async updateLang(
    prisma: PrismaClient,
    discordId: string,
    lang: string
  ): Promise<UserLangRow> {
    if (lang !== LANG_AUTO && !isSupportedLanguage(lang)) {
      throw new ServiceError(
        'UNSUPPORTED_LANGUAGE',
        `unsupported language: ${lang}`
      )
    }

    const exists = await prisma.user.findUnique({
      where: { id: discordId },
      select: { id: true }
    })
    if (!exists) {
      throw new ServiceError('USER_NOT_FOUND', `user ${discordId} not found`)
    }

    return prisma.user.update({
      where: { id: discordId },
      data: { lang }
    })
  }
} as const
