/**
 * `/harvest` 슬래시 커맨드.
 *
 * 유저의 모든 공장을 일괄 수확하고 결과를 Embed로 요약한다.
 * - `UserService.ensure`로 유저/토지/창고 레코드를 보장
 * - `HarvestService.harvestAll`로 생산/소비/XP를 트랜잭션 처리
 * - 결과는 ephemeral Embed로 응답
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { getFactoryEntry, type MaterialBag } from '@idle/game-core'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import { UserService } from '../../services/user'
import { HarvestService } from '../../services/harvest'
import { formatBigInt } from '../../structures/renderers/FactoryRenderer'

function formatMaterialBag(bag: MaterialBag, emptyLabel: string): string {
  const parts: string[] = []
  for (const [mat, amt] of Object.entries(bag)) {
    if (!amt || amt <= 0n) continue
    parts.push(`${formatBigInt(amt)} ${mat}`)
  }
  if (parts.length === 0) return emptyLabel
  return parts.join(', ')
}

export class HarvestCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const { db } = this.container
    const t = await fetchT(interaction)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? 'en-US'
    })

    const result = await HarvestService.harvestAll(db, interaction.user.id)

    if (result.factories.length === 0) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.warn,
          title: t('game:harvest.result.title'),
          body: t('game:harvest.result.none'),
          ephemeral: true
        })
      )
    }

    const noneProduced = t('game:harvest.result.noneProduced')
    const noneConsumed = t('game:harvest.result.noneConsumed')

    const lines = result.factories.map((f) => {
      const entry = getFactoryEntry(
        f.type as Parameters<typeof getFactoryEntry>[0]
      )
      const produced = formatMaterialBag(f.produced, noneProduced)
      const consumed = formatMaterialBag(f.consumed, noneConsumed)
      return t('game:harvest.result.line', {
        emoji: entry.emoji,
        type: f.type,
        produced,
        consumed,
        ticks: f.ticks
      })
    })

    const summary = t('game:harvest.result.summary', {
      count: result.factories.length,
      xp: formatBigInt(result.xpGained)
    })

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.success,
        title: t('game:harvest.result.title'),
        body: [summary, '', ...lines].join('\n'),
        ephemeral: true
      })
    )
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('harvest')
        .setDescription('Harvest all of your factories at once.')
        .setNameLocalization('ko', '수확')
        .setDescriptionLocalization('ko', '모든 공장을 한번에 수확합니다.')
    )
  }
}
