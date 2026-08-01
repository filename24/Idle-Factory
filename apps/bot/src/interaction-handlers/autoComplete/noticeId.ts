/**
 * `/공지` 의 공지 ID 자동완성.
 *
 * **owner 검사가 필수다.** Sapphire 의 precondition 은 autocomplete 인터랙션에서
 * 실행되지 않으므로, 커맨드 쪽 `OwnerOnly` 만으로는 이 핸들러가 보호되지 않는다.
 * 게이팅이 없으면 임의 유저가 전체 공지의 id·제목을 열거할 수 있고, 그 id 는
 * 곧바로 `/공지 옵션:삭제` 의 입력값이 된다.
 *
 * owner 판정 기준은 `preconditions/OwnerOnly.ts` 와 동일하게
 * `BotClient.dokdo.owners` 를 단일 출처로 쓴다.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import type {
  ApplicationCommandOptionChoiceData,
  AutocompleteInteraction
} from 'discord.js'
import type BotClient from '@structures/BotClient'

export class NoticeIdAutocomplete extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Autocomplete
    })
  }

  public override parse(interaction: AutocompleteInteraction) {
    if (interaction.commandName !== '공지') return this.none()
    // 비-owner 는 조용히 무시한다 — 응답하지 않으면 자동완성 목록이 비어 보일 뿐,
    // 공지 존재 여부나 개수를 노출하지 않는다.
    const owners = (this.container.client as BotClient).dokdo.owners
    if (!owners.includes(interaction.user.id)) return this.none()
    return this.some()
  }

  public async run(interaction: AutocompleteInteraction) {
    const focused = interaction.options.getFocused()
    const data = await this.container.db.notice.findMany({
      where: focused
        ? { title: { contains: focused, mode: 'insensitive' } }
        : undefined,
      take: 25,
      orderBy: { postedAt: 'desc' }
    })
    const choices: ApplicationCommandOptionChoiceData[] = data.map(
      (notice: { id: string; title: string }) => ({
        name: `${notice.id} (${notice.title})`,
        value: notice.id
      })
    )
    await interaction.respond(choices)
  }
}
