import { describe, expect, it } from 'vitest'
import {
  resolveAnnounceAction,
  type AnnounceActionInput
} from '../../src/commands/game/announceAction'

/**
 * `resolveAnnounceAction` 순수 함수 분기 표 검증.
 *
 * DB·discord 목 없이 입력 조합만으로 8개 분기
 * (guildOnly/notAdmin/notRegistered/cleared/set/notTextable/current/none)를
 * 전부 커버한다.
 */
const base: AnnounceActionInput = {
  inGuild: true,
  hasManage: true,
  guildExists: true,
  clear: false,
  channelId: null,
  isTextable: false,
  currentChannelId: null
}

describe('resolveAnnounceAction', () => {
  it('returns guildOnly when not in a guild', () => {
    expect(resolveAnnounceAction({ ...base, inGuild: false })).toEqual({
      action: 'guildOnly'
    })
  })

  it('returns notAdmin when the member lacks ManageGuild', () => {
    expect(resolveAnnounceAction({ ...base, hasManage: false })).toEqual({
      action: 'notAdmin'
    })
  })

  it('returns notRegistered when the guild is not registered', () => {
    expect(resolveAnnounceAction({ ...base, guildExists: false })).toEqual({
      action: 'notRegistered'
    })
  })

  it('returns cleared when clear is requested', () => {
    expect(
      resolveAnnounceAction({ ...base, clear: true, channelId: '123' })
    ).toEqual({ action: 'cleared' })
  })

  it('returns set with the channel id when a textable channel is given', () => {
    expect(
      resolveAnnounceAction({
        ...base,
        channelId: '999',
        isTextable: true
      })
    ).toEqual({ action: 'set', channelId: '999' })
  })

  it('returns notTextable when the given channel is not textable', () => {
    expect(
      resolveAnnounceAction({
        ...base,
        channelId: '999',
        isTextable: false
      })
    ).toEqual({ action: 'notTextable' })
  })

  it('returns current with the stored channel id when none supplied', () => {
    expect(resolveAnnounceAction({ ...base, currentChannelId: '777' })).toEqual(
      { action: 'current', channelId: '777' }
    )
  })

  it('returns none when no channel is stored and none supplied', () => {
    expect(resolveAnnounceAction(base)).toEqual({ action: 'none' })
  })

  it('prioritizes guildOnly over every other branch', () => {
    expect(
      resolveAnnounceAction({
        ...base,
        inGuild: false,
        hasManage: false,
        guildExists: false,
        clear: true
      })
    ).toEqual({ action: 'guildOnly' })
  })

  it('prioritizes clear over a supplied channel', () => {
    expect(
      resolveAnnounceAction({
        ...base,
        clear: true,
        channelId: '999',
        isTextable: true
      })
    ).toEqual({ action: 'cleared' })
  })
})
