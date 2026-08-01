/**
 * `/help` 카탈로그 구성 로직 — 순수 헬퍼 모듈.
 *
 * Sapphire 는 `commands/` 아래 **모든** 파일을 피스로 로드하므로 피스가 아닌
 * 헬퍼는 이 곳(`utils/`)에 두어야 한다 (apps/bot/AGENTS.md 규약). 덕분에
 * 도움말의 분류·정렬·멘션 해석을 discord.js 없이 단위 테스트할 수 있다.
 *
 * 명령 목록을 하드코딩하지 않고 런타임 command store 에서 만들기 때문에,
 * 명령을 추가하거나 지워도 도움말이 따로 손대지 않고 따라온다.
 */

/**
 * 도움말이 필요로 하는 명령의 최소 형태.
 *
 * Sapphire 의 `Command` 를 그대로 받지 않고 구조적 타입으로 좁혀 두면 테스트가
 * 무거운 피스를 인스턴스화하지 않아도 된다. `Command` 는 이 형태를 만족한다.
 */
export interface HelpCatalogCommand {
  /** 슬래시 명령 이름 (`/` 뒤에 오는 값). */
  readonly name: string
  /** 명령 등록 시의 영문 설명 — 로케일 키가 없을 때의 폴백. */
  readonly description: string
  /** 명령 파일이 놓인 디렉터리. 스토어 루트에 있으면 `null`. */
  readonly category: string | null
  /** Sapphire 가 등록 후 채우는 application command id 레지스트리. */
  readonly applicationCommandRegistry: {
    readonly globalChatInputCommandIds: ReadonlySet<string>
    readonly guildIdToChatInputCommandIds: ReadonlyMap<
      string,
      ReadonlySet<string>
    >
  }
  /** 슬래시 명령을 지원하는지 — 메시지 전용 피스를 걸러낸다. */
  supportsChatInputCommands(): boolean
}

/** 누구에게나 보이는 카테고리 — 배열 순서가 곧 도움말 표시 순서다. */
export const PUBLIC_CATEGORIES = ['game', 'info', 'settings'] as const

/** owner 에게만 보이는 카테고리 (`commands/dev/`). */
export const OWNER_CATEGORY = 'dev'

/**
 * 이번 호출에서 실제로 보여줄 카테고리를 정한다.
 *
 * `requested` 는 옵션 choices 로 제한되지만, 비-owner 가 API 로 `dev` 를 직접
 * 보내는 경우가 있으므로 여기서 한 번 더 교집합을 취한다. 허용되지 않은 값이면
 * 빈 배열이 되고, 호출부는 이를 "그런 분류 없음" 응답으로 처리한다.
 *
 * @param isOwner 호출자가 봇 owner 인지
 * @param requested 사용자가 고른 분류 (미지정이면 `null`)
 * @returns 표시 순서대로 정렬된 카테고리 목록
 */
export function resolveVisibleCategories(
  isOwner: boolean,
  requested: string | null
): string[] {
  const visible: string[] = isOwner
    ? [...PUBLIC_CATEGORIES, OWNER_CATEGORY]
    : [...PUBLIC_CATEGORIES]

  return requested
    ? visible.filter((category) => category === requested)
    : visible
}

/**
 * 슬래시를 지원하는 명령을 카테고리별로 묶고 이름순으로 정렬한다.
 *
 * 카테고리가 없는 명령(스토어 루트에 놓인 경우)은 어디에도 넣지 않는다. 현재
 * 그런 명령은 없고, 생기더라도 도움말이 임의의 분류로 감추기보다 빠뜨린 것을
 * 드러내는 편이 낫다.
 *
 * @param commands command store 가 들고 있는 명령들
 * @returns 카테고리 → 이름순 명령 목록
 */
export function groupCommandsByCategory<T extends HelpCatalogCommand>(
  commands: Iterable<T>
): Map<string, T[]> {
  const grouped = new Map<string, T[]>()

  for (const command of commands) {
    if (!command.supportsChatInputCommands()) continue
    if (!command.category) continue

    const bucket = grouped.get(command.category)
    if (bucket) bucket.push(command)
    else grouped.set(command.category, [command])
  }

  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => a.name.localeCompare(b.name))
  }

  return grouped
}

/**
 * 클릭 가능한 슬래시 멘션을 만든다.
 *
 * 글로벌 등록 id 를 우선 쓰고, 없으면 현재 길드에 한정 등록된 id 를 본다
 * (`dev` 명령은 `DEV_GUILD_ID` 길드에만 등록될 수 있다). 둘 다 없으면 — 등록
 * 직후라 레지스트리가 아직 비어 있는 경우 등 — 평범한 코드 스팬으로 폴백한다.
 *
 * @param command 대상 명령
 * @param guildId 호출이 일어난 길드 (DM 이면 `null`)
 * @returns `</name:id>` 또는 `` `/name` ``
 */
export function commandMention(
  command: HelpCatalogCommand,
  guildId: string | null
): string {
  const { globalChatInputCommandIds, guildIdToChatInputCommandIds } =
    command.applicationCommandRegistry

  const guildIds = guildId
    ? guildIdToChatInputCommandIds.get(guildId)
    : undefined

  const id =
    globalChatInputCommandIds.values().next().value ??
    guildIds?.values().next().value

  return id ? `</${command.name}:${id}>` : `\`/${command.name}\``
}

/**
 * 명령 한 줄을 `멘션 — 요약` 형태로 렌더한다.
 *
 * 요약문은 `embeds:command.help.entries.<name>` 키에서 읽고, 키가 없으면 명령
 * 자신의 영문 `description` 으로 폴백한다. 새 명령을 만들고 로케일 키를
 * 빠뜨려도 도움말이 깨지는 대신 영문으로 노출되게 한 것이다.
 *
 * @param translate 로케일 키를 문자열로 바꾸는 함수 (기본값 폴백 지원)
 * @param command 렌더할 명령
 * @param guildId 호출이 일어난 길드 (DM 이면 `null`)
 */
export function renderCommandLine(
  translate: (key: string, defaultValue: string) => string,
  command: HelpCatalogCommand,
  guildId: string | null
): string {
  const summary = translate(
    `embeds:command.help.entries.${command.name}`,
    command.description
  )
  return `${commandMention(command, guildId)} — ${summary}`
}
