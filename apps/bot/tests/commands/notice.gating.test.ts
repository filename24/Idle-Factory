/**
 * `/공지` 권한 게이팅 회귀 테스트.
 *
 * 이 커맨드는 `db.notice.delete` 로 공지를 영구 삭제한다. 게이팅이 빠지면 임의
 * 서버의 임의 유저가 공지를 지울 수 있으므로, `admin.ts`·`debug.ts` 와 동일한
 * 이중 방어를 강제한다:
 *  1. `preconditions: ['OwnerOnly']`
 *  2. `config.devGuildID` 설정 시 개발 길드 한정 등록
 *
 * 자동완성(`noticeId.ts`)도 함께 검증한다. Sapphire 의 precondition 은
 * autocomplete 인터랙션에서 실행되지 않으므로, 커맨드만 잠그면 공지 id·제목이
 * 그대로 열거된다 — 그 id 가 곧 삭제 명령의 입력값이다.
 */

import { vi, describe, expect, it, beforeAll } from 'vitest'
import { container } from '@sapphire/framework'

vi.mock('@utils/ComponentsV2.js', () => ({
  simpleV2Payload: () => ({}),
  V2_ACCENT: { error: 0, success: 0, warn: 0 }
}))

// vi.mock 은 파일 최상단으로 호이스팅되므로 팩토리 안에서 상단 변수를 참조할 수
// 없다. devGuildID 는 리터럴로 두고, 아래 상수와 값을 맞춘다.
vi.mock('../../src/config', () => ({
  default: { devGuildID: '111111111111111111' }
}))

/** 위 mock 의 devGuildID 와 동일해야 한다. */
const DEV_GUILD_ID = '111111111111111111'

import { NoticeCommand } from '../../src/commands/dev/notice'
import { NoticeIdAutocomplete } from '../../src/interaction-handlers/autoComplete/noticeId'

/** Sapphire 피스 생성자가 요구하는 최소 LoaderContext 스텁. */
const loaderContext = {
  name: 'stub',
  path: '',
  root: '',
  store: { name: 'stub', options: {} }
} as never

// Command 생성자는 기본 쿨다운을 읽으려고 전역 container 의 client.options 에
// 접근한다. 봇을 띄우지 않는 유닛 테스트라 최소 형태만 채워 준다.
beforeAll(() => {
  container.client = { options: {} } as never
})

describe('/공지 커맨드 게이팅', () => {
  it('OwnerOnly precondition 을 요구한다', () => {
    const command = new NoticeCommand(loaderContext, {} as never)

    // Sapphire 는 생성자 options 의 preconditions 를 컨테이너로 감싼다.
    const serialized = JSON.stringify(command.preconditions)
    expect(serialized).toContain('OwnerOnly')
  })

  it('devGuildID 가 설정되면 개발 길드에만 등록한다', () => {
    const command = new NoticeCommand(loaderContext, {} as never)

    let capturedOptions: unknown
    const registry = {
      registerChatInputCommand: (_builder: unknown, options: unknown) => {
        capturedOptions = options
      }
    }

    command.registerApplicationCommands(registry as never)

    expect(capturedOptions).toEqual({ guildIds: [DEV_GUILD_ID] })
  })
})

describe('/공지 ID 자동완성 게이팅', () => {
  const OWNER_ID = '222222222222222222'
  const OUTSIDER_ID = '333333333333333333'

  /** owner 목록을 주입한 자동완성 핸들러를 만든다. */
  function makeHandler(): NoticeIdAutocomplete {
    const handler = new NoticeIdAutocomplete(loaderContext, {} as never)
    Object.defineProperty(handler, 'container', {
      value: { client: { dokdo: { owners: [OWNER_ID] } } },
      configurable: true
    })
    return handler
  }

  /** 자동완성 인터랙션 스텁. */
  const interaction = (commandName: string, userId: string) =>
    ({ commandName, user: { id: userId } }) as never

  it('owner 에게는 후보를 제공한다', () => {
    const result = makeHandler().parse(interaction('공지', OWNER_ID))
    expect(result.isSome()).toBe(true)
  })

  it('비-owner 는 무시해 공지 id 를 열거시키지 않는다', () => {
    const result = makeHandler().parse(interaction('공지', OUTSIDER_ID))
    expect(result.isSome()).toBe(false)
  })

  it('다른 커맨드의 자동완성에는 관여하지 않는다', () => {
    const result = makeHandler().parse(interaction('공장', OWNER_ID))
    expect(result.isSome()).toBe(false)
  })
})
