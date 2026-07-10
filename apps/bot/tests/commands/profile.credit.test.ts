import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'
import { buildServerCreditLine } from '../../src/commands/game/profile'

/**
 * 키를 그대로 반환하는 가짜 t 함수.
 *
 * 라인 문자열에 어떤 로케일 키가 참조됐는지 검증하기 위해 사용한다.
 */
const fakeT = ((key: string) => key) as unknown as TFunction

describe('buildServerCreditLine', () => {
  it('includes the serverCredit field label and the credit value with pt unit', () => {
    const line = buildServerCreditLine(fakeT, 1000)

    expect(line).toContain('game:profile.fields.serverCredit')
    expect(line).toContain('1000 pt')
  })

  it.each([
    [299, 'RESTRICTED'],
    [300, 'LIMITED'],
    [699, 'LIMITED'],
    [700, 'NORMAL'],
    [999, 'NORMAL'],
    [1000, 'TRUSTED'],
    [1499, 'TRUSTED'],
    [1500, 'ELITE']
  ])('maps credit %i to tier key %s', (credit, tier) => {
    const line = buildServerCreditLine(fakeT, credit)

    expect(line).toContain(`game:server.vault.creditTier.${tier}`)
  })
})
