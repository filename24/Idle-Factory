/**
 * `UserSettingsRenderer` 유닛 테스트.
 *
 * 개인 언어 설정 패널의 Components v2 구조를 고정한다. 검증 포인트:
 *  - 레거시 필드(embeds/content) 없이 Container 루트로만 구성되는지
 *  - TextDisplay 와 ActionRow 사이에 Separator 가 있는지 (apps/bot/AGENTS.md 필수 규칙)
 *  - 'auto' + 지원 로케일 전체가 선택지로 노출되고 현재 값에 default 가 붙는지
 *
 * `t` 는 키를 그대로 돌려주는 항등 함수로 대체해 번역 리소스에 의존하지 않는다.
 */

import { describe, expect, it } from 'vitest'
import { V2_ACCENT } from '../../src/utils/ComponentsV2'
import { LANG_AUTO, LANGUAGE_LABELS } from '../../src/utils/language'
import { buildUserSettingsContainer } from '../../src/structures/renderers/UserSettingsRenderer'

/** discord.js 컴포넌트 type 상수 — 원시 JSON 검증용. */
const TYPE = {
  actionRow: 1,
  stringSelect: 3,
  textDisplay: 10,
  separator: 14
} as const

/** 번역을 거치지 않고 키를 그대로 노출하는 t 스텁. */
const t = ((key: string) => key) as never

/** 컨테이너를 원시 JSON 으로 펼친다. */
function render(lang: string) {
  return buildUserSettingsContainer(
    { userId: '111111111111111111', lang },
    t
  ).toJSON() as {
    accent_color?: number
    components: Array<Record<string, never> & { type: number }>
  }
}

/** 렌더 결과에서 언어 select 컴포넌트를 꺼낸다. */
function langSelect(json: ReturnType<typeof render>) {
  const row = json.components.find((c) => c.type === TYPE.actionRow) as
    | { components: Array<Record<string, never>> }
    | undefined
  return row?.components[0] as
    | {
        type: number
        custom_id: string
        placeholder?: string
        options: Array<{ label: string; value: string; default?: boolean }>
      }
    | undefined
}

describe('buildUserSettingsContainer — Components v2 구조', () => {
  it('info accent 의 Container 를 반환한다', () => {
    const json = render(LANG_AUTO)

    expect(json.accent_color).toBe(V2_ACCENT.info)
  })

  it('TextDisplay 와 ActionRow 사이에 Separator 가 들어간다', () => {
    const types = render(LANG_AUTO).components.map((c) => c.type)
    const lastText = types.lastIndexOf(TYPE.textDisplay)
    const firstRow = types.indexOf(TYPE.actionRow)

    expect(firstRow).toBeGreaterThan(-1)
    expect(types.slice(lastText, firstRow)).toContain(TYPE.separator)
  })

  it('레거시 embed/content 필드를 노출하지 않는다', () => {
    const json = render(LANG_AUTO) as Record<string, unknown>

    expect(json.embeds).toBeUndefined()
    expect(json.content).toBeUndefined()
  })
})

describe('buildUserSettingsContainer — 언어 select', () => {
  it('유저 id 를 담은 customId 를 쓴다', () => {
    const select = langSelect(render(LANG_AUTO))

    expect(select?.type).toBe(TYPE.stringSelect)
    expect(select?.custom_id).toBe('user:settings:lang:111111111111111111')
  })

  it("'auto' 를 첫 선택지로, 이어서 지원 로케일 전체를 노출한다", () => {
    const options = langSelect(render(LANG_AUTO))?.options ?? []

    expect(options.map((o) => o.value)).toEqual([LANG_AUTO, 'ko', 'en-US'])
  })

  it('각 언어는 자기 언어 이름(endonym)으로 표시한다', () => {
    const options = langSelect(render(LANG_AUTO))?.options ?? []
    const byValue = Object.fromEntries(options.map((o) => [o.value, o.label]))

    expect(byValue.ko).toBe(LANGUAGE_LABELS.ko)
    expect(byValue['en-US']).toBe(LANGUAGE_LABELS['en-US'])
  })

  it('현재 값에만 default 가 붙는다', () => {
    const options = langSelect(render('en-US'))?.options ?? []
    const defaults = options.filter((o) => o.default).map((o) => o.value)

    expect(defaults).toEqual(['en-US'])
  })

  it("미설정(auto) 상태에서는 'auto' 에 default 가 붙는다", () => {
    const options = langSelect(render(LANG_AUTO))?.options ?? []
    const defaults = options.filter((o) => o.default).map((o) => o.value)

    expect(defaults).toEqual([LANG_AUTO])
  })

  it('DB 에 미지원 값이 남아 있어도 렌더는 깨지지 않고 default 만 비워진다', () => {
    const options = langSelect(render('fr'))?.options ?? []

    expect(options).toHaveLength(3)
    expect(options.some((o) => o.default)).toBe(false)
  })
})
