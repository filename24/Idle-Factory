/**
 * `/공지` — 공지 삭제/전송 운영 커맨드.
 *
 * 게이팅(이중 방어) — `admin.ts`·`debug.ts` 와 동일 규약:
 *  1. `preconditions: ['OwnerOnly']` — owner 만 실행.
 *  2. `config.devGuildID` 설정 시 개발 길드에만 등록.
 *
 * 이 커맨드는 `db.notice.delete` 로 공지를 **영구 삭제**한다. 게이팅이 없으면
 * 임의 서버의 임의 유저가 공지를 지울 수 있으므로 두 방어선 모두 필수다.
 * 자동완성(`interaction-handlers/autoComplete/noticeId.ts`)에도 동일한 owner
 * 검사가 걸려 있어야 한다 — precondition 은 autocomplete 인터랙션에서 실행되지
 * 않으므로, 그쪽을 열어 두면 삭제에 필요한 공지 id 목록이 그대로 열거된다.
 */

import { Command } from '@sapphire/framework'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2.js'
import config from '../../config'

export class NoticeCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, preconditions: ['OwnerOnly'] })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const option = interaction.options.getString('옵션') as 'delete' | 'send'
    const id = interaction.options.getString('id')
    const { db } = this.container

    if (option === 'delete') {
      if (!id) {
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: '삭제 옵션을 사용하려면 ID를 입력해야 합니다.',
            ephemeral: false
          })
        )
      }

      const existing = await db.notice.findUnique({ where: { id } })
      if (!existing) {
        return interaction.reply(
          simpleV2Payload({
            accent: V2_ACCENT.error,
            body: '해당 ID의 공지를 찾을 수 없습니다.',
            ephemeral: false
          })
        )
      }

      await db.notice.delete({ where: { id } })
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          body: `공지 \`${existing.title}\` 을(를) 삭제했습니다.`,
          ephemeral: false
        })
      )
    }

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.warn,
        body: '공지 전송 기능은 아직 구현되지 않았습니다.',
        ephemeral: false
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand(
      (builder) =>
        builder
          .setName('공지')
          .setDescription('공지를 삭제하거나 전송합니다.')
          .addStringOption((option) =>
            option
              .setName('옵션')
              .setDescription('공지 옵션')
              .setRequired(true)
              .setChoices(
                { name: '삭제', value: 'delete' },
                { name: '전송', value: 'send' }
              )
          )
          .addStringOption((option) =>
            option
              .setName('id')
              .setDescription('공지 ID (삭제 옵션에서만 사용)')
              .setAutocomplete(true)
              .setRequired(false)
          ),
      config.devGuildID ? { guildIds: [config.devGuildID] } : undefined
    )
  }
}
