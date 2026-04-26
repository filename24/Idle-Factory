/**
 * 공개(non-ephemeral) 메시지에 붙은 버튼/셀렉트가 엉뚱한 유저에 의해 조작되지 않도록
 * customId 에 호출자의 Discord `userId` 를 박아넣고, 핸들러 진입 시 대조한다.
 *
 * 사용 패턴:
 *
 * 1. 페이로드를 만들 때: `customId = \`${prefix}${ownerId}:${...rest}\``
 * 2. 핸들러 `parse()`: `parseOwnerPrefixedCustomId(customId, prefix)` 로 ownerId + rest 분리
 * 3. 핸들러 `run()` 제일 앞: `await assertInteractionOwner(interaction, ownerId)` —
 *    본인이면 그대로 진행, 아니면 ephemeral 경고를 돌려주고 `false` 반환하므로 호출 측은 early return
 *
 * 참조: `docs/design/11-land.md` §인터랙션 권한.
 */

import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT, v2Flags } from './ComponentsV2'

type AnyInteraction = ButtonInteraction | StringSelectMenuInteraction

/**
 * `<prefix><ownerId>:<rest>` 형태의 customId에서 ownerId와 남은 문자열을 분리한다.
 *
 * @param customId 대상 customId 전체
 * @param prefix   고정 prefix (예: `land:cell:`)
 * @returns `{ ownerId, rest }` 또는 prefix/형식 불일치 시 `null`
 */
export function parseOwnerPrefixedCustomId(
  customId: string,
  prefix: string
): { ownerId: string; rest: string } | null {
  if (!customId.startsWith(prefix)) return null
  const afterPrefix = customId.slice(prefix.length)
  const colon = afterPrefix.indexOf(':')
  if (colon <= 0) return null
  const ownerId = afterPrefix.slice(0, colon)
  const rest = afterPrefix.slice(colon + 1)
  // Discord snowflake 는 순수 숫자 문자열. 공백/콜론 방어.
  if (!/^\d{5,25}$/.test(ownerId)) return null
  return { ownerId, rest }
}

/**
 * 인터랙션 호출자가 `ownerId` 본인인지 확인한다.
 *
 * 본인이 아니면 클릭자에게만 보이는 ephemeral 경고를 보내고 `false` 를 반환한다.
 * 핸들러는 이 값이 `false` 면 즉시 early return 해야 한다.
 *
 * @returns 본인이면 `true`, 아니면 `false` (그리고 ephemeral reply 전송됨)
 */
export async function assertInteractionOwner(
  interaction: AnyInteraction,
  ownerId: string
): Promise<boolean> {
  if (interaction.user.id === ownerId) return true
  const t = await fetchT(interaction)
  await interaction.reply({
    components: [
      simpleContainer(
        V2_ACCENT.warn,
        undefined,
        t('game:common.error.notYourInteraction')
      )
    ],
    flags: v2Flags(true)
  })
  return false
}
