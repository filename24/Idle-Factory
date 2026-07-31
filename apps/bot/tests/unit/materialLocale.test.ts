import { describe, expect, test } from 'vitest'
import { MATERIAL_TYPES } from '@idle/game-core'
import ko from '../../src/locales/ko/game.json'
import enUS from '../../src/locales/en-US/game.json'

// 자재 라벨은 `game.material.<TYPE>` 로케일 키에서 나온다. 새 자재를 추가하고
// 카탈로그를 갱신하지 않으면 `localizeMaterial` 의 defaultValue 폴백 때문에
// raw enum(`TEXTILE` 등)이 그대로 유저에게 노출된다 — 타입도 테스트도 이를
// 잡아주지 않으므로 여기서 고정한다.
describe('game.material 로케일 커버리지', () => {
  test.each([
    ['ko', ko],
    ['en-US', enUS]
  ])('%s 카탈로그가 모든 MaterialType 을 정확히 덮는다', (_lng, catalog) => {
    expect(Object.keys(catalog.material).sort()).toEqual(
      [...MATERIAL_TYPES].sort()
    )
  })
})
