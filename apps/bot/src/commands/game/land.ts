/**
 * `/land` 커맨드.
 *
 * 서브커맨드:
 * - `view`: 호출자의 토지(4×4)를 이모지 그리드로 렌더링해서 ephemeral Embed로 응답.
 * - `buy`: N번째 토지(2~5)를 `1,000,000 × 10^(N-2)` 💰에 구매 (docs/design/11-land.md).
 *
 * DB 접근은 `this.container.db` (Prisma 기반 `DatabaseClient`)를 사용한다.
 * 렌더링 자체는 `@structures/renderers`의 순수 함수 `renderLand`에 위임한다.
 *
 * 참조: `docs/design/11-land.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import {
  formatBigInt,
  renderLand,
  type FactoryDTO,
  type SlotDTO
} from '@structures/renderers'
import { UserService } from '../../services/user'
import {
  LandService,
  MAX_BUYABLE_INDEX,
  MIN_BUYABLE_INDEX
} from '../../services/land'
import { ServiceError } from '../../services/base'

/** 서브커맨드 이름 상수. */
const SUB_VIEW = 'view'
const SUB_BUY = 'buy'

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
    if (sub === SUB_BUY) {
      return this.handleBuy(interaction)
    }
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: 'Unknown subcommand.',
        ephemeral: true
      })
    )
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
    const { db } = this.container
    const t = await fetchT(interaction)

    const hydrated = await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    const land = hydrated.lands.find((l) => l.index === 1)
    if (!land) {
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t('game:common.error.userNotFound'),
          ephemeral: true
        })
      )
    }

    const factories = await db.factory.findMany({
      where: { userId: hydrated.id },
      select: { type: true, grade: true, anchorX: true, anchorY: true }
    })

    const slotDTOs: SlotDTO[] = land.slots.map(
      (s: (typeof land.slots)[number]) => ({
        x: s.x,
        y: s.y,
        type: s.type
      })
    )

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

    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.info,
        title: t('game:land.view.title'),
        body: `${grid}\n\n${legend}`,
        ephemeral: true
      })
    )
  }

  /**
   * `/land buy` 핸들러.
   *
   * 1. `UserService.ensure`로 유저가 존재하도록 보장.
   * 2. `LandService.buy`로 N번째 토지 구매 (자금 차감 + 특수 슬롯 재추첨).
   * 3. 성공 시 success accent로 비용·잔액 응답, 실패 시 `ServiceError.code`를 i18n 키로 매핑.
   */
  private async handleBuy(interaction: Command.ChatInputCommandInteraction) {
    const { db } = this.container
    const t = await fetchT(interaction)

    const targetIndex = interaction.options.getInteger('index', true)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    try {
      const result = await LandService.buy(db, {
        userId: interaction.user.id,
        targetIndex
      })
      return interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.success,
          body: t('game:land.buy.success', {
            index: result.targetIndex,
            cost: formatBigInt(result.cost),
            remaining: formatBigInt(result.remainingMoney),
            total: result.totalLands
          }),
          ephemeral: true
        })
      )
    } catch (err) {
      return this.replyBuyError(interaction, err, t)
    }
  }

  /** `/land buy` 실패 시 `ServiceError.code`를 i18n 키로 매핑해 경고 응답. */
  private async replyBuyError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    t: TFunction
  ) {
    let body: string
    if (err instanceof ServiceError) {
      switch (err.code) {
        case 'MAX_LANDS':
          body = t('game:land.buy.error.maxLands', { max: MAX_BUYABLE_INDEX })
          break
        case 'LAND_ALREADY_EXISTS':
          body = t('game:land.buy.error.alreadyExists')
          break
        case 'INVALID_LAND_INDEX':
          body = t('game:land.buy.error.invalidIndex', {
            min: MIN_BUYABLE_INDEX,
            max: MAX_BUYABLE_INDEX
          })
          break
        case 'INSUFFICIENT_MONEY':
          body = t('game:land.buy.error.insufficientMoney')
          break
        case 'USER_NOT_FOUND':
          body = t('game:common.error.userNotFound')
          break
        default:
          this.container.logger.error(err)
          body = t('game:common.error.unknown')
      }
    } else {
      this.container.logger.error(err)
      body = t('game:common.error.unknown')
    }
    const payload = simpleV2Payload({
      accent: V2_ACCENT.warn,
      body,
      ephemeral: true
    })
    if (interaction.replied || interaction.deferred) {
      return interaction.followUp(payload)
    }
    return interaction.reply(payload)
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName('land')
        .setDescription('View or expand your lands.')
        .setNameLocalization('ko', '토지')
        .setDescriptionLocalization('ko', '내 토지를 확인하거나 확장합니다.')
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
        .addSubcommand((sub) =>
          sub
            .setName(SUB_BUY)
            .setDescription('Buy your next land (2nd–5th).')
            .setNameLocalization('ko', '구매')
            .setDescriptionLocalization('ko', '다음 토지를 구매합니다.')
            .addIntegerOption((o) =>
              o
                .setName('index')
                .setDescription('Land index (2–5).')
                .setNameLocalization('ko', '번호')
                .setDescriptionLocalization('ko', '구매할 토지 번호 (2~5).')
                .setRequired(true)
                .setMinValue(MIN_BUYABLE_INDEX)
                .setMaxValue(MAX_BUYABLE_INDEX)
            )
        )
    )
  }
}
