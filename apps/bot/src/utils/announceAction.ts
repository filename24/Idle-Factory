/**
 * `/server announce` 서브커맨드의 순수 결정 로직 (#42 후속).
 *
 * discord/DB 의존성 없이 입력값만으로 어떤 응답을 낼지 결정한다.
 * 실제 부작용(권한 검사·DB 갱신·로케일 응답)은 `server.ts` 의
 * `handleAnnounce` 가 담당하고, 이 모듈은 분기만 계산해 단위 테스트를
 * 용이하게 한다.
 *
 * 참조: docs/design/07-global-system.md §공지, GitHub #42
 */

/**
 * `resolveAnnounceAction` 입력.
 *
 * 모든 필드는 호출 측(핸들러)이 discord/DB 상태에서 추출해 넘긴다.
 */
export interface AnnounceActionInput {
  /** 서버 컨텍스트 여부 (`interaction.guildId` 존재) */
  inGuild: boolean
  /** 실행자가 `서버 관리`(ManageGuild) 권한을 가졌는지 */
  hasManage: boolean
  /** 서버가 게임에 등록돼 있는지 (`Guild` 행 존재) */
  guildExists: boolean
  /** `clear` 옵션이 `true` 인지 (공지 채널 해제 요청) */
  clear: boolean
  /** 선택된 채널 옵션의 ID. 없으면 `null` */
  channelId: string | null
  /** 선택된 채널이 텍스트 전송 가능한지 */
  isTextable: boolean
  /** 현재 저장된 공지 채널 ID. 없으면 `null` */
  currentChannelId: string | null
}

/**
 * `resolveAnnounceAction` 결과 액션 종류.
 *
 * - `guildOnly` — DM 등 서버 밖에서 실행
 * - `notAdmin` — 관리 권한 없음
 * - `notRegistered` — 미등록 서버
 * - `cleared` — 공지 채널 해제됨
 * - `set` — 공지 채널 지정됨(`channelId` 동반)
 * - `notTextable` — 지정 대상이 전송 불가 채널
 * - `current` — 현재 공지 채널 조회(`channelId` 동반)
 * - `none` — 설정된 공지 채널 없음
 */
export type AnnounceActionKind =
  | 'guildOnly'
  | 'notAdmin'
  | 'notRegistered'
  | 'cleared'
  | 'set'
  | 'notTextable'
  | 'current'
  | 'none'

/**
 * `resolveAnnounceAction` 결과.
 *
 * `set`/`current` 만 `channelId` 를 동반한다(응답에 채널 멘션이 필요).
 */
export interface AnnounceActionResult {
  /** 결정된 액션 종류 */
  action: AnnounceActionKind
  /** `set`·`current` 응답에 사용할 채널 ID */
  channelId?: string
}

/**
 * 입력 상태로부터 `/server announce` 응답 액션을 결정한다.
 *
 * 우선순위: 게이팅(guildOnly → notAdmin → notRegistered) → 해제(clear) →
 * 채널 지정(set/notTextable) → 조회(current/none). 부작용 없이 순수하게
 * 분기만 계산하므로 단위 테스트에서 전 경로를 검증할 수 있다.
 */
export function resolveAnnounceAction(
  input: AnnounceActionInput
): AnnounceActionResult {
  if (!input.inGuild) return { action: 'guildOnly' }
  if (!input.hasManage) return { action: 'notAdmin' }
  if (!input.guildExists) return { action: 'notRegistered' }

  if (input.clear) return { action: 'cleared' }

  if (input.channelId !== null) {
    if (!input.isTextable) return { action: 'notTextable' }
    return { action: 'set', channelId: input.channelId }
  }

  if (input.currentChannelId !== null) {
    return { action: 'current', channelId: input.currentChannelId }
  }

  return { action: 'none' }
}
