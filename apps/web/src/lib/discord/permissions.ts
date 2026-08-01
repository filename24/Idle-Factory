/**
 * Discord 권한 비트 판정 — 순수 함수, I/O 없음.
 *
 * ## `permissions` 는 반드시 BigInt 로 다뤄야 한다
 *
 * Discord 는 권한을 **10진 문자열**로 준다. 값이 이미 `Number.MAX_SAFE_INTEGER`
 * 를 넘기 때문에 `parseInt` 로 읽으면 상위 비트가 뭉개진다. 뭉개진 값으로
 * 비트 검사를 하면 권한이 있는 사람을 없다고 하거나, 더 나쁘게는 **없는
 * 사람을 있다고** 판정할 수 있다.
 */

/** `MANAGE_GUILD` 권한 비트 (1 << 5). */
export const MANAGE_GUILD = 1n << 5n
/** `ADMINISTRATOR` 권한 비트 (1 << 3). 다른 모든 권한을 포함한다. */
export const ADMINISTRATOR = 1n << 3n

/** `GET /users/@me/guilds` 가 돌려주는 부분 길드 객체 중 우리가 쓰는 필드. */
export interface PartialGuild {
  readonly id: string
  readonly name?: string
  readonly icon?: string | null
  /** 이 유저가 서버 소유자인가. */
  readonly owner?: boolean
  /** 이 유저의 계산된 권한 비트 — 10진 문자열. */
  readonly permissions?: string
}

/**
 * 권한 문자열을 BigInt 로 안전하게 파싱한다.
 *
 * 파싱 실패는 권한 없음으로 본다(fail closed). 잘못된 입력에 대해 관대하면
 * 그게 곧 우회 경로가 된다.
 *
 * @param permissions Discord 가 준 10진 문자열
 */
export function parsePermissions(permissions: unknown): bigint {
  if (typeof permissions !== 'string' || permissions.trim() === '') return 0n
  try {
    const parsed = BigInt(permissions)
    return parsed < 0n ? 0n : parsed
  } catch {
    return 0n
  }
}

/**
 * 이 유저가 해당 서버에서 서버 설정을 바꿀 수 있는가.
 *
 * 소유자이거나, `ADMINISTRATOR` 또는 `MANAGE_GUILD` 비트를 가지면 참이다.
 * 어떤 예외 상황에서도 기본값은 **거짓**이다.
 *
 * @param guild 부분 길드 객체
 */
export function hasManageGuild(guild: PartialGuild | null | undefined): boolean {
  if (!guild) return false
  if (guild.owner === true) return true

  const bits = parsePermissions(guild.permissions)
  return (bits & ADMINISTRATOR) !== 0n || (bits & MANAGE_GUILD) !== 0n
}

/**
 * 길드 ID(Discord snowflake) 형식을 검증한다.
 *
 * 모든 I/O 보다 **먼저** 호출해야 한다 — 형식이 틀린 값이 Discord API 나
 * Prisma 에 도달하게 두지 않는다.
 *
 * @param value 검증할 값
 */
export function isValidGuildId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{5,25}$/.test(value)
}

/**
 * 부여된 OAuth 스코프 문자열에 특정 스코프가 있는지 확인한다.
 *
 * better-auth 는 스코프를 **콤마로 join** 해 `AuthAccount.scope` 에 저장한다.
 * 공백 구분으로 가정하면 항상 거짓이 되므로 둘 다 받아들인다.
 *
 * @param granted 저장된 스코프 문자열 또는 배열
 * @param scope 확인할 스코프
 */
export function hasScope(
  granted: string | readonly string[] | null | undefined,
  scope: string,
): boolean {
  if (!granted) return false
  const list = Array.isArray(granted)
    ? granted
    : String(granted)
        .split(/[,\s]+/)
        .filter(Boolean)
  return list.includes(scope)
}
