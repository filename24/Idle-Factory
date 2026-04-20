/**
 * `/land` 커맨드.
 *
 * 서브커맨드:
 * - `view`: 호출자의 토지(3×3)를 이모지 그리드로 렌더링해서 ephemeral Embed로 응답.
 *
 * DB 접근은 `this.container.db` (Prisma 기반 `DatabaseClient`)를 사용한다.
 * 렌더링 자체는 `@structures/renderers`의 순수 함수 `renderLand`에 위임한다.
 *
 * 참조: `docs/design/11-land.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import Embed from '@utils/Embed'
import {
  renderLand,
  type FactoryDTO,
  type SlotDTO
} from '@structures/renderers'
import { UserService } from '../../services/user'

/** 서브커맨드 이름 상수. */
const SUB_VIEW = 'view'

export class LandCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options })
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction
  ) {
    const sub = interaction.options.getSubcommand(true)
    if (sub === SUB_VIEW) {
      return this.handleView(interaction)
    }
    return interaction.reply({
      ephemeral: true,
      content: 'Unknown subcommand.'
    })
  }

  /**
   * `/land view` 핸들러.
   *
   * 1. `UserService.ensure`로 유저/토지/창고를 보장하고 hydrated 엔터티를 얻는다.
   * 2. 해당 유저의 Factory 목록을 조회한다.
   * 3. 슬롯/공장 DTO로 변환해 `renderLand`로 grid/legend를 생성한다.
   * 4. Embed로 감싸 ephemeral 응답.
   */
  private async handleView(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    const { client, db } = this.container
    const t = await fetchT(interaction)

    const hydrated = await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    const land = hydrated.land
    if (!land) {
      return interaction.reply({
        ephemeral: true,
        embeds: [
          new Embed(client, 'error').setDescription(
            t('game:common.error.userNotFound')
          )
        ]
      })
    }

    const factories = await db.factory.findMany({
      where: { userId: hydrated.id },
      select: { type: true, grade: true, anchorX: true, anchorY: true }
    })

    const slotDTOs: SlotDTO[] = land.slots.map((s) => ({
      x: s.x,
      y: s.y,
      type: s.type,
      // Phase 1 스키마에는 per-slot lock 플래그가 없어 false 고정.
      locked: false
    }))

    const factoryDTOs: FactoryDTO[] = factories.map((f) => ({
      type: f.type,
      grade: f.grade,
      anchorX: f.anchorX,
      anchorY: f.anchorY
    }))

    const { grid, legend } = renderLand(
      { width: land.width, height: land.height },
      factoryDTOs,
      slotDTOs
    )

    const embed = new Embed(client, 'info')
      .setTitle(t('game:land.view.title'))
      .setDescription(grid)
      .addFields([{ name: '\u200b', value: legend }])

    return interaction.reply({ ephemeral: true, embeds: [embed] })
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('land')
        .setDescription('View your land grid.')
        .setNameLocalization('ko', '토지')
        .setDescriptionLocalization('ko', '내 토지를 확인합니다.')
        .addSubcommand((sub) =>
          sub
            .setName(SUB_VIEW)
            .setDescription('Show your land as an emoji grid.')
            .setNameLocalization('ko', '보기')
            .setDescriptionLocalization(
              'ko',
              '이모지 그리드로 내 토지를 봅니다.'
            )
        )
    )
  }
}
