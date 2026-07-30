/**
 * 개인 설정 — 언어 변경 select 핸들러.
 *
 * customId: `user:settings:lang:<userId>`.
 *
 * 흐름:
 *  1. customId 에 박힌 소유자 id 와 클릭한 유저가 같은지 검증 (타인 패널 조작 차단).
 *  2. `UserService.updateLang` 적용.
 *  3. 갱신된 값으로 동일 패널 재렌더 (`interaction.update`).
 *
 * 3번의 `fetchT` 는 반드시 저장 **이후에** 다시 호출한다. 언어 리졸버가 방금 바꾼
 * `User.lang` 을 읽어야 패널이 새 언어로 그려지기 때문이다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import type { StringSelectMenuInteraction } from 'discord.js'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { buildUserSettingsContainer } from '@structures/renderers'
import { parseUserLanguageSelection } from '@utils/language'
import { ServiceError } from '../../services/base'
import { UserService } from '../../services/user'

export class UserLanguageSelectHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.SelectMenu
    })
  }

  public override parse(interaction: StringSelectMenuInteraction) {
    const parsed = parseUserLanguageSelection(
      interaction.customId,
      interaction.values[0]
    )
    return parsed ? this.some(parsed) : this.none()
  }

  public async run(
    interaction: StringSelectMenuInteraction,
    data: { userId: string; lang: string }
  ): Promise<void> {
    if (interaction.user.id !== data.userId) {
      await replyNotOwner(interaction, await fetchT(interaction))
      return
    }

    await interaction.deferUpdate()

    // 게임을 아직 시작하지 않아 User row 가 없을 수 있다. 언어만 바꾸러 온
    // 유저에게 "먼저 게임을 시작하세요"를 요구하는 건 과하므로 여기서 시드한다.
    await UserService.ensure(this.container.db, {
      discordId: data.userId,
      nickname: interaction.user.username
    })

    let updatedLang = data.lang
    try {
      const updated = await UserService.updateLang(
        this.container.db,
        data.userId,
        data.lang
      )
      updatedLang = updated.lang
    } catch (error) {
      if (
        error instanceof ServiceError &&
        error.code === 'UNSUPPORTED_LANGUAGE'
      ) {
        await interaction.followUp(
          simpleV2Payload({
            accent: V2_ACCENT.warn,
            body: (await fetchT(interaction))(
              'embeds:userSettings.error.unsupported'
            ),
            ephemeral: true
          })
        )
        return
      }
      throw error
    }

    // 저장 후 재조회 — 리졸버가 새 User.lang 을 읽어 패널이 새 언어로 그려진다.
    const t = await fetchT(interaction)
    await interaction.editReply({
      components: [
        buildUserSettingsContainer(
          { userId: data.userId, lang: updatedLang },
          t
        )
      ]
    } as Parameters<typeof interaction.editReply>[0])
  }
}

async function replyNotOwner(
  interaction: StringSelectMenuInteraction,
  t: TFunction
): Promise<void> {
  await interaction.reply(
    simpleV2Payload({
      accent: V2_ACCENT.warn,
      body: t('embeds:userSettings.error.notOwner'),
      ephemeral: true
    })
  )
}
