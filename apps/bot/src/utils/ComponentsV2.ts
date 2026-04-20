/**
 * Discord Components v2 공용 헬퍼.
 *
 * 레거시 `EmbedBuilder` 전면 금지 정책에 따라 모든 봇 응답은
 * `MessageFlags.IsComponentsV2` + `ContainerBuilder` 루트로 구성된다.
 * 이 모듈은 중복되는 단순 응답 구성을 표준화한다.
 *
 * 참조: `.claude/skills/componentsv2-builder/SKILL.md`.
 */

import {
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
  type BaseMessageOptions,
  type InteractionReplyOptions
} from 'discord.js'

/**
 * 상황별 고정 accent 팔레트.
 *
 * SKILL.md 의 팔레트와 1:1 일치. 하드코딩 금지를 위해 호출 측은
 * 반드시 이 상수를 참조해야 한다.
 */
export const V2_ACCENT = {
  /** 기본/정보 (blurple) */
  info: 0x5865f2,
  /** 성공/수령 (green) */
  success: 0x57f287,
  /** 경고 (yellow) */
  warn: 0xfee75c,
  /** 위험/오류 (red) */
  error: 0xed4245,
  /** 뽑기/특별 (fuchsia) */
  rare: 0xeb459e
} as const

/** `V2_ACCENT` 값의 유니언 타입. */
export type V2AccentColor = (typeof V2_ACCENT)[keyof typeof V2_ACCENT]

/** `simpleContainer` / `simpleV2Payload`의 옵션. */
export interface SimpleV2Options {
  /** accent stripe 색상 (`V2_ACCENT.*` 사용 권장) */
  accent: number
  /** 제목 (`# **제목**` 형태로 렌더됨). 없으면 생략 */
  title?: string
  /** 본문 텍스트. 마크다운 허용 */
  body?: string
  /** 하단 푸터 (`-# ...` 회색 메타) */
  footer?: string
  /** 개인 응답 여부 — `true` 면 Ephemeral 플래그를 추가한다 */
  ephemeral?: boolean
}

/**
 * 단순 Container 빌더를 반환한다.
 *
 * 제목/본문/푸터가 모두 비어있을 수 있지만, SKILL.md 의 "폭 확보" 규칙상
 * 적어도 본문 한 줄은 채우는 것이 권장된다.
 *
 * @param accent Container accent 색상
 * @param title `# **타이틀**` 으로 렌더할 제목 (선택)
 * @param body 본문 텍스트 (선택)
 * @param footer `-# ...` 푸터 (선택)
 */
export function simpleContainer(
  accent: number,
  title?: string,
  body?: string,
  footer?: string
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(accent)
  if (title) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# **${title}**`)
    )
  }
  if (body) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(body)
    )
  }
  if (footer) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${footer}`)
    )
  }
  return container
}

/**
 * 표준 Components v2 Interaction reply 페이로드를 만든다.
 *
 * - 항상 `flags` 에 `MessageFlags.IsComponentsV2` 를 포함한다.
 * - `ephemeral: true` 면 `MessageFlags.Ephemeral` 비트를 OR 한다.
 *   (discord.js v14에서 `ephemeral` 옵션과 v2 플래그는 함께 쓰지 않는다.)
 * - `embeds` / `content` 는 절대 포함되지 않는다.
 */
export function simpleV2Payload(
  opts: SimpleV2Options
): InteractionReplyOptions {
  const container = simpleContainer(
    opts.accent,
    opts.title,
    opts.body,
    opts.footer
  )
  return {
    components: [container],
    flags: v2Flags(opts.ephemeral)
  }
}

/**
 * 여러 Container 로 구성된 v2 페이로드를 만든다.
 *
 * 예) 상단 Container(정보) + 하단 Container(경고) 분리.
 */
export function v2PayloadFromContainers(
  containers: ContainerBuilder[],
  ephemeral = false
): InteractionReplyOptions {
  return {
    components: containers,
    flags: v2Flags(ephemeral)
  }
}

/**
 * `BaseMessageOptions` 형태(예: `channel.send`, `user.send`)로 Components v2 페이로드를 만든다.
 *
 * DM/채널 전송은 Ephemeral 플래그를 지원하지 않으므로 여기서는 v2 플래그만 세팅한다.
 */
export function v2MessageOptions(
  containers: ContainerBuilder[]
): BaseMessageOptions & { flags: number } {
  return {
    components: containers,
    flags: MessageFlags.IsComponentsV2
  }
}

/**
 * Components v2 + (선택적) Ephemeral 플래그 비트마스크를 반환한다.
 */
export function v2Flags(ephemeral?: boolean): number {
  return ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2
}
