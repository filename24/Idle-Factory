import { GuildService } from '@idle/game-services'
import { db } from '../db'
import { requireGuildAdmin, type GuildAdminErrorCode } from '../guild-admin/authorize'
import { mapServiceError } from '../mutation'
import { revalidatePath } from 'next/cache'

/**
 * 서버 설정 변경 뮤테이션.
 *
 * 게임 뮤테이션(`defineGameMutation`)과 인가 모델이 다르다 — 저쪽은 "내
 * 리소스인가"를 보고, 여기는 "이 서버의 관리자인가"를 Discord 에 물어본다.
 * 그래서 별도 래퍼를 쓰되, 실패를 값으로 돌려주는 계약은 동일하게 맞춘다.
 *
 * **모든 변경은 `requireGuildAdmin` 을 통과해야 한다.** 클라이언트가 보낸
 * `guildId` 는 매번 재인가한다 — "아까 확인했으니 괜찮다"는 캐시나 토큰은 없다.
 */

/** 설정 변경 결과. */
export type GuildSettingResult =
  | { readonly ok: true }
  | {
      readonly ok: false
      readonly code: GuildAdminErrorCode | 'INVALID_VALUE' | 'INTERNAL'
      readonly status: number
    }

/** 봇이 번역 리소스를 가진 로케일. 웹 로케일(`ko`/`en`)과 **다르다**. */
export const GUILD_LANG_CHOICES = ['ko', 'en-US'] as const

/** 설정 가능한 가산세. docs/design/07 §세금·정산. */
export const GUILD_TAX_CHOICES = [0, 0.05, 0.1, 0.15, 0.2] as const

/** 부동소수 비교 허용 오차 — 폼에서 문자열로 왕복하므로 필요하다. */
const TAX_EPSILON = 1e-9

/** FormData 와 평범한 객체에서 값을 꺼낸다. */
function field(raw: unknown, name: string): unknown {
  if (raw instanceof FormData) {
    const value = raw.get(name)
    return value === null ? undefined : value
  }
  return (raw as Record<string, unknown> | null)?.[name]
}

/** 실패 결과를 만든다. */
function fail(
  code: GuildAdminErrorCode | 'INVALID_VALUE' | 'INTERNAL',
  status: number,
): GuildSettingResult {
  return { ok: false, code, status }
}

/**
 * 서버 언어를 변경한다.
 *
 * 값은 봇의 지원 로케일 화이트리스트로만 받는다. 범위 검사가 아니라 **열거
 * 일치**여야 하는 이유는, 번역 리소스가 없는 로케일을 저장하면 리졸버가 조용히
 * 무시해 "바꿨는데 안 바뀌는" 상태가 되기 때문이다.
 *
 * @param raw `guildId`, `lang`
 */
export async function updateGuildLang(raw: unknown): Promise<GuildSettingResult> {
  const authorization = await requireGuildAdmin(field(raw, 'guildId'))
  if (!authorization.ok) return fail(authorization.code, authorization.status)

  const lang = field(raw, 'lang')
  if (typeof lang !== 'string' || !GUILD_LANG_CHOICES.includes(lang as never)) {
    return fail('INVALID_VALUE', 400)
  }

  try {
    // 인가를 통과한 id 로만 쓴다. 폼에서 두 번째로 읽어 오지 않는다.
    await GuildService.updateLang(db, authorization.guildId, lang)
  } catch (error) {
    return fail('INTERNAL', mapServiceError(error).status)
  }

  revalidatePath(`/dashboard/${authorization.guildId}`)
  return { ok: true }
}

/**
 * 서버 가산세를 변경한다.
 *
 * @param raw `guildId`, `surcharge`
 */
export async function updateGuildTax(raw: unknown): Promise<GuildSettingResult> {
  const authorization = await requireGuildAdmin(field(raw, 'guildId'))
  if (!authorization.ok) return fail(authorization.code, authorization.status)

  const rawSurcharge = field(raw, 'surcharge')
  const surcharge = typeof rawSurcharge === 'string' ? Number(rawSurcharge) : rawSurcharge

  if (
    typeof surcharge !== 'number' ||
    !Number.isFinite(surcharge) ||
    !GUILD_TAX_CHOICES.some((choice) => Math.abs(choice - surcharge) < TAX_EPSILON)
  ) {
    return fail('INVALID_VALUE', 400)
  }

  try {
    // 서비스가 0~0.2 를 다시 클램프한다 — 여기 화이트리스트는 심층 방어다.
    await GuildService.updateTaxSurcharge(db, authorization.guildId, surcharge)
  } catch (error) {
    return fail('INTERNAL', mapServiceError(error).status)
  }

  revalidatePath(`/dashboard/${authorization.guildId}`)
  return { ok: true }
}
