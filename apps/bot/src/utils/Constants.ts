export const enum InteractionType {
  SlashCommand,
  Button,
  Select,
  ContextMenu,
  Modal,
  AutoComplete
}

export const enum ReportType {
  Webhook,
  Text
}

/**
 * 약관·개인정보 처리방침 버전.
 *
 * 버전 문자열은 갱신될 때마다 ISO 날짜로 bump 한다.
 * `User.agreedTermsVersion` / `User.agreedPrivacyVersion` 컬럼과 비교해
 * 미스매치 시 재동의 프롬프트를 띄울 수 있다(현재는 미구현, v1 자리만).
 */
export const CONSENT_VERSIONS = {
  terms: '2026-04-26',
  privacy: '2026-04-26'
} as const

/**
 * 외부 약관·개인정보 페이지 URL.
 *
 * Privacy 는 모회사 Infinite Studio 가 운영하는 외부 페이지를 사용한다.
 * Terms 는 게임 웹앱(`apps/web`)이 자체 호스팅한다 — `NEXT_PUBLIC_APP_URL` 미설정 시 기본 도메인 사용.
 */
export const PRIVACY_URL = 'https://inft.kr/privacy'

const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://idle.inft.kr'
export const TERMS_URL = `${WEB_BASE_URL}/terms`

/**
 * Onboarding precondition 의 deny identifier.
 * `Events.ChatInputCommandDenied` 리스너가 이 값으로 분기.
 */
export const ONBOARDING_DENY_IDENTIFIER = 'onboardingRequired'

/**
 * 동의 버튼 customId prefix. `assertInteractionOwner` + `parseOwnerPrefixedCustomId` 와 결합해
 * `onboard:agree:<ownerId>:<schemaVersion>` / `onboard:decline:...` 로 사용.
 */
export const ONBOARDING_AGREE_PREFIX = 'onboard:agree:'
export const ONBOARDING_DECLINE_PREFIX = 'onboard:decline:'

/** 동의 페이로드 스키마 버전 — UI 변경 시 bump 해 옛 메시지 클릭을 무력화. */
export const ONBOARDING_PROMPT_VERSION = 'v1'

/**
 * 길드 설정 인터랙션 customId prefix.
 *
 * - `guild:settings:open:<guildId>` — guildCreate 메시지의 [⚙️ 서버 설정] 버튼.
 * - `guild:settings:lang:<guildId>` — 언어 select.
 * - `guild:settings:tax:<guildId>`  — 세율 select.
 *
 * 클릭 시 `ManageGuild` 권한 검증 후 처리.
 */
export const GUILD_SETTINGS_OPEN_PREFIX = 'guild:settings:open:'
export const GUILD_SETTINGS_LANG_PREFIX = 'guild:settings:lang:'
export const GUILD_SETTINGS_TAX_PREFIX = 'guild:settings:tax:'
