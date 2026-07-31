'use server'

/**
 * 서버 설정 Server Action.
 *
 * 본체는 `src/lib/mutations/guild-settings.ts` 에 있다 — 커버리지 범위가
 * `src/lib/**` 라 여기에 로직을 넣으면 검증에서 빠진다. 재export 도 쓸 수 없어
 * (`'use server'` 모듈은 직접 선언한 async 함수만 액션으로 인식) 얇은 래퍼로 감싼다.
 */

import {
  updateGuildLang,
  updateGuildTax,
  type GuildSettingResult,
} from '@/lib/mutations/guild-settings'

/**
 * 서버 언어 변경.
 *
 * @param formData `guildId`, `lang`
 */
export async function updateGuildLangAction(formData: FormData): Promise<GuildSettingResult> {
  return updateGuildLang(formData)
}

/**
 * 서버 가산세 변경.
 *
 * @param formData `guildId`, `surcharge`
 */
export async function updateGuildTaxAction(formData: FormData): Promise<GuildSettingResult> {
  return updateGuildTax(formData)
}
