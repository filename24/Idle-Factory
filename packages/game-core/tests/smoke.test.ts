import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GAME_CORE_VERSION } from '../src/index'

describe('game-core smoke', () => {
  it('exports a version string', () => {
    expect(GAME_CORE_VERSION).toBe('1.0.0')
  })

  /**
   * 릴리스 체크리스트 (#21): `GAME_CORE_VERSION` 은 시뮬레이션 리포트 헤더와
   * 밸런스 데이터의 버전 표기에 쓰인다. package.json 과 어긋나면 아티팩트가
   * 어느 밸런스로 돌았는지 추적할 수 없게 되므로 테스트로 묶어 둔다.
   */
  it('GAME_CORE_VERSION 이 package.json 의 version 과 일치한다', () => {
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
      version: string
    }
    expect(GAME_CORE_VERSION).toBe(manifest.version)
  })
})
