/**
 * `/land` 커맨드.
 *
 * 서브커맨드:
 * - `view`: 호출자의 토지(4×4)를 이모지 그리드로 렌더링해서 ephemeral 응답.
 *   `index` 옵션 또는 Prev/Next 버튼으로 보유한 여러 토지를 순회할 수 있다.
 * - `buy`: N번째 토지(2~5)를 `1,000,000 × 10^(N-2)` 💰에 구매 (docs/design/11-land.md).
 *
 * DB 접근은 `this.container.db` (Prisma 기반 `DatabaseClient`)를 사용한다.
 * 렌더링 자체는 `@structures/renderers`의 순수 함수 `renderLand`에 위임한다.
 *
 * 참조: `docs/design/11-land.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type InteractionReplyOptions,
  MessageFlags
} from 'discord.js'
import {
  formatBigInt,
  renderCells,
  type FactoryDTO,
  type RenderedCell,
  type SlotDTO
} from '@structures/renderers'
import { FACTORY_CATALOG, buildCost, type FactoryType } from '@idle/game-core'
import {
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} from 'discord.js'
import { MVP_FACTORY_CHOICES } from './factory'
import { UserService } from '../../services/user'
import {
  LandService,
  MAX_BUYABLE_INDEX,
  MIN_BUYABLE_INDEX
} from '../../services/land'
import { ServiceError } from '../../services/base'
import type { DatabaseClient } from '@idle/database'
import { nextOwnedIndex, prevOwnedIndex } from './landNav'

/** 서브커맨드 이름 상수. */
const SUB_VIEW = 'view'
const SUB_BUY = 'buy'

/** 버튼 customId prefix — `land:view:<index>` 형태로 사용한다. */
export const LAND_VIEW_BUTTON_PREFIX = 'land:view:'

/** 셀 버튼 customId prefix — `land:cell:<landIdx>:<x>:<y>` 형태로 사용한다. */
export const LAND_CELL_BUTTON_PREFIX = 'land:cell:'

/** 건설 타입 Select customId prefix — `land:build:<landIdx>:<x>:<y>` 형태. */
export const LAND_BUILD_SELECT_PREFIX = 'land:build:'

/** 건설 Select의 "취소" 옵션 값. 공장 타입 enum과 겹치지 않는 sentinel. */
export const LAND_BUILD_CANCEL_VALUE = '__cancel__'

/** 공장 액션 메뉴 customId prefix — `factory:action:<factoryId>:<verb>` 형태. */
export const FACTORY_ACTION_BUTTON_PREFIX = 'factory:action:'

/** 공장 철거 확인 버튼 customId prefix — `factory:destroy:<factoryId>:<yes|cancel>` 형태. */
export const FACTORY_DESTROY_BUTTON_PREFIX = 'factory:destroy:'

/** `/land view` 페이로드 빌더 결과 (reply/update 양쪽 호환). */
export interface LandViewPayload {
  readonly components: InteractionReplyOptions['components']
  readonly flags: number
}

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
    return interaction.reply({
      components: [
        simpleContainer(V2_ACCENT.error, undefined, 'Unknown subcommand.')
      ],
      flags: v2Flags(true)
    })
  }

  /**
   * `/land view` 핸들러.
   *
   * `index` 옵션이 주어지면 해당 번호 토지를 보여주고, 없으면 최저 번호 토지를 보여준다.
   * 유저가 해당 번호 토지를 보유하지 않으면 에러 응답.
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

    if (hydrated.lands.length === 0) {
      return interaction.reply({
        components: [
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:common.error.userNotFound')
          )
        ],
        flags: v2Flags(true)
      })
    }

    const requested = interaction.options.getInteger('index') ?? undefined
    const targetIndex = requested ?? minOwnedIndex(hydrated.lands)

    const payload = await buildLandViewPayload(db, {
      userId: hydrated.id,
      targetIndex,
      t
    })
    return interaction.reply(payload as InteractionReplyOptions)
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
      return interaction.reply({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.buy.success', {
              index: result.targetIndex,
              cost: formatBigInt(result.cost),
              remaining: formatBigInt(result.remainingMoney),
              total: result.totalLands
            })
          )
        ],
        flags: v2Flags(true)
      })
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
    const payload: InteractionReplyOptions = {
      components: [simpleContainer(V2_ACCENT.warn, undefined, body)],
      flags: v2Flags(true)
    }
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
            .addIntegerOption((o) =>
              o
                .setName('index')
                .setDescription('Land number to view (1-5).')
                .setNameLocalization('ko', '번호')
                .setDescriptionLocalization('ko', '볼 토지 번호 (1~5).')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_BUYABLE_INDEX)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName(SUB_BUY)
            .setDescription('Buy your next land (2nd-5th).')
            .setNameLocalization('ko', '구매')
            .setDescriptionLocalization('ko', '다음 토지를 구매합니다.')
            .addIntegerOption((o) =>
              o
                .setName('index')
                .setDescription('Land index (2-5).')
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

/** 소유한 토지 중 최소 index를 반환한다. 입력 배열이 비어있지 않음을 호출자가 보장해야 한다. */
function minOwnedIndex(
  lands: ReadonlyArray<{ readonly index: number }>
): number {
  let min = lands[0]!.index
  for (const l of lands) if (l.index < min) min = l.index
  return min
}

/** `buildLandViewPayload` 입력. */
export interface BuildLandViewInput {
  readonly userId: string
  readonly targetIndex: number
  readonly t: TFunction
}

/**
 * `/land view` 응답 및 버튼 인터랙션 `update`에 공통으로 쓰이는 페이로드 빌더.
 *
 * - 소유 토지 목록을 조회해 `targetIndex`가 실제로 보유한 번호인지 확인
 * - `renderLand`로 이모지 그리드 생성
 * - Prev/Next 버튼(customId: `land:view:<index>`)을 양옆 owned index로 연결
 */
export async function buildLandViewPayload(
  db: DatabaseClient,
  input: BuildLandViewInput
): Promise<LandViewPayload> {
  const { userId, targetIndex, t } = input

  const lands = await db.land.findMany({
    where: { userId },
    orderBy: { index: 'asc' },
    select: { index: true }
  })
  const ownedIndices = lands.map((l) => l.index)
  const ownedSet = new Set(ownedIndices)

  if (!ownedSet.has(targetIndex)) {
    return {
      components: [
        simpleContainer(
          V2_ACCENT.error,
          undefined,
          t('game:land.view.error.notOwned')
        )
      ],
      flags: v2Flags(true)
    }
  }

  const land = await db.land.findUniqueOrThrow({
    where: { userId_index: { userId, index: targetIndex } },
    include: { slots: true }
  })

  const factories = await db.factory.findMany({
    where: { userId, landId: land.id },
    select: { type: true, grade: true, anchorX: true, anchorY: true }
  })

  const slotDTOs: SlotDTO[] = land.slots.map((s) => ({
    x: s.x,
    y: s.y,
    type: s.type
  }))
  const factoryDTOs: FactoryDTO[] = factories.map((f) => ({
    type: f.type,
    grade: f.grade,
    anchorX: f.anchorX,
    anchorY: f.anchorY
  }))

  const cells = renderCells(
    { width: land.width, height: land.height },
    factoryDTOs,
    slotDTOs
  )

  const title = t('game:land.view.title', {
    index: targetIndex,
    total: ownedIndices.length
  })
  const container = simpleContainer(
    V2_ACCENT.info,
    title,
    t('game:land.view.legend')
  )

  // 4×4 셀 그리드: y=0..3마다 ActionRow 1개 (각 4 버튼).
  for (let y = 0; y < land.height; y++) {
    const rowCells = cells.slice(y * land.width, (y + 1) * land.width)
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...rowCells.map((c) => buildCellButton(c, targetIndex))
      )
    )
  }

  // Prev/Next: 소유한 index 기준 양 옆. 없으면 disable + customId는 현재 index로.
  const prevIndex = prevOwnedIndex(ownedIndices, targetIndex)
  const nextIndex = nextOwnedIndex(ownedIndices, targetIndex)

  const prevButton = new ButtonBuilder()
    .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${prevIndex ?? targetIndex}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:land.view.buttonPrev'))
    .setDisabled(prevIndex === null)
  const nextButton = new ButtonBuilder()
    .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${nextIndex ?? targetIndex}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(t('game:land.view.buttonNext'))
    .setDisabled(nextIndex === null)

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(prevButton, nextButton)
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  }
}

/**
 * 셀 한 개에 대응하는 Discord 버튼을 만든다.
 *
 * - `factory-anchor`: Primary 스타일, 클릭 가능 (등급 정보는 상세 모달에서)
 * - `empty` / `special`: Secondary 스타일, 클릭 가능
 * - `factory-body`: Secondary + disabled (2×2 공장의 비앵커 셀 — 시각 점유만 유지)
 *
 * customId는 `land:cell:<landIdx>:<x>:<y>` 포맷으로 `LandCellButtonHandler`가 파싱한다.
 */
function buildCellButton(cell: RenderedCell, landIndex: number): ButtonBuilder {
  const style =
    cell.kind === 'factory-anchor' ? ButtonStyle.Primary : ButtonStyle.Secondary
  const disabled = cell.kind === 'factory-body'
  return new ButtonBuilder()
    .setCustomId(`${LAND_CELL_BUTTON_PREFIX}${landIndex}:${cell.x}:${cell.y}`)
    .setStyle(style)
    .setEmoji(cell.emoji)
    .setDisabled(disabled)
}

/** `buildBuildTypeSelectPayload` 입력. */
export interface BuildBuildTypeSelectInput {
  readonly userLevel: number
  readonly landIndex: number
  readonly x: number
  readonly y: number
  readonly t: TFunction
}

/**
 * 빈/특수 셀 클릭 시 건설할 공장 타입을 고르게 하는 StringSelect 포함 페이로드.
 *
 * - 옵션: `MVP_FACTORY_CHOICES` 중 `user.level >= unlockLevel`인 공장 + 취소
 * - 라벨: `{emoji} {TYPE} ({buildCost}💰, Lv{unlockLevel})`
 * - customId: `land:build:<landIdx>:<x>:<y>` — `LandBuildTypeSelectHandler`가 파싱
 *
 * 서버는 select 제출 시 다시 유효성(소유/빈 셀/자금/재료)을 검증한다.
 */
export function buildBuildTypeSelectPayload(
  input: BuildBuildTypeSelectInput
): LandViewPayload {
  const { userLevel, landIndex, x, y, t } = input

  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.build.selectTitle', { index: landIndex, x, y })
  )

  const optionBuilders: StringSelectMenuOptionBuilder[] = []
  for (const type of MVP_FACTORY_CHOICES) {
    const entry = FACTORY_CATALOG[type]
    const label = t('game:land.build.selectOption', {
      emoji: entry.emoji,
      type,
      cost: formatBigInt(buildCost(type)),
      unlock: entry.unlockLevel
    })
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(label.slice(0, 100))
      .setValue(type)
    if (userLevel < entry.unlockLevel) {
      opt.setDescription(`Lv${entry.unlockLevel} 필요`)
    }
    optionBuilders.push(opt)
  }
  optionBuilders.push(
    new StringSelectMenuOptionBuilder()
      .setLabel(t('game:land.build.selectCancel'))
      .setValue(LAND_BUILD_CANCEL_VALUE)
  )

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_BUILD_SELECT_PREFIX}${landIndex}:${x}:${y}`)
    .setPlaceholder(t('game:land.build.selectPlaceholder'))
    .addOptions(...optionBuilders)

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  }
}

/** 셀 클릭 시 DB에서 해당 셀의 분류(빈/특수/공장-앵커 등)를 결정한다. */
export interface ResolvedLandCell {
  readonly land: { readonly id: string; readonly index: number }
  readonly cell: RenderedCell
}

/**
 * 주어진 `(userId, landIndex, x, y)`에 해당하는 셀 정보를 DB에서 권위있게 읽어 반환한다.
 *
 * 클라이언트 상태를 신뢰하지 않고 서버에서 다시 계산해 race/변조에 방어한다.
 * 토지를 보유하지 않거나 셀 좌표가 범위를 벗어나면 `null`.
 */
/** `buildFactoryActionMenuPayload` 입력. */
export interface BuildFactoryActionMenuInput {
  readonly factoryId: string
  readonly landIndex: number
  readonly factoryType: FactoryType
  readonly grade: number
  readonly anchorX: number
  readonly anchorY: number
  readonly t: TFunction
}

/**
 * 공장 앵커 셀 클릭 시 뜨는 액션 메뉴 페이로드.
 *
 * 버튼: [정보] [수확] [업그레이드] [철거(Danger)] + 2번째 ActionRow [돌아가기].
 *
 * customId:
 * - `factory:action:<factoryId>:info|harvest|upgrade|destroy` — 액션 버튼
 * - `land:view:<landIndex>` — 돌아가기 (기존 land view 핸들러 재사용)
 */
export function buildFactoryActionMenuPayload(
  input: BuildFactoryActionMenuInput
): LandViewPayload {
  const { factoryId, landIndex, factoryType, grade, anchorX, anchorY, t } =
    input
  const emoji = FACTORY_CATALOG[factoryType].emoji
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.factory.menuTitle', {
      emoji,
      type: factoryType,
      grade,
      landIndex,
      x: anchorX,
      y: anchorY
    })
  )

  const infoBtn = new ButtonBuilder()
    .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:info`)
    .setLabel(t('game:land.factory.actionInfo'))
    .setStyle(ButtonStyle.Secondary)
  const harvestBtn = new ButtonBuilder()
    .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:harvest`)
    .setLabel(t('game:land.factory.actionHarvest'))
    .setStyle(ButtonStyle.Success)
  const upgradeBtn = new ButtonBuilder()
    .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:upgrade`)
    .setLabel(t('game:land.factory.actionUpgrade'))
    .setStyle(ButtonStyle.Primary)
  const destroyBtn = new ButtonBuilder()
    .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:destroy`)
    .setLabel(t('game:land.factory.actionDestroy'))
    .setStyle(ButtonStyle.Danger)
  const backBtn = new ButtonBuilder()
    .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${landIndex}`)
    .setLabel(t('game:land.factory.actionBack'))
    .setStyle(ButtonStyle.Secondary)

  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      infoBtn,
      harvestBtn,
      upgradeBtn,
      destroyBtn
    )
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(backBtn)
  )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  }
}

/** `buildDestroyConfirmPayload` 입력. */
export interface BuildDestroyConfirmInput {
  readonly factoryId: string
  readonly factoryType: FactoryType
  readonly refund: bigint
  readonly t: TFunction
}

/**
 * 공장 철거 2단계 확인 페이로드.
 *
 * 경고 accent + 환불 금액 안내 + [철거(Danger)] [취소(Secondary)] 버튼 1줄.
 * customId: `factory:destroy:<factoryId>:yes` / `:cancel`
 */
export function buildDestroyConfirmPayload(
  input: BuildDestroyConfirmInput
): LandViewPayload {
  const { factoryId, factoryType, refund, t } = input
  const emoji = FACTORY_CATALOG[factoryType].emoji
  const container = simpleContainer(
    V2_ACCENT.warn,
    t('game:factory.destroy.confirmTitle', { emoji, type: factoryType }),
    t('game:factory.destroy.confirmBody', { refund: formatBigInt(refund) })
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${FACTORY_DESTROY_BUTTON_PREFIX}${factoryId}:yes`)
        .setLabel(t('game:factory.destroy.confirmYes'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${FACTORY_DESTROY_BUTTON_PREFIX}${factoryId}:cancel`)
        .setLabel(t('game:factory.destroy.confirmCancel'))
        .setStyle(ButtonStyle.Secondary)
    )
  )
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
  }
}

export async function resolveLandCell(
  db: DatabaseClient,
  userId: string,
  landIndex: number,
  x: number,
  y: number
): Promise<ResolvedLandCell | null> {
  const land = await db.land.findUnique({
    where: { userId_index: { userId, index: landIndex } },
    include: { slots: true }
  })
  if (!land) return null
  if (x < 0 || x >= land.width || y < 0 || y >= land.height) return null

  const factories = await db.factory.findMany({
    where: { userId, landId: land.id },
    select: { type: true, grade: true, anchorX: true, anchorY: true }
  })
  const slotDTOs: SlotDTO[] = land.slots.map((s) => ({
    x: s.x,
    y: s.y,
    type: s.type
  }))
  const factoryDTOs: FactoryDTO[] = factories.map((f) => ({
    type: f.type as FactoryType,
    grade: f.grade,
    anchorX: f.anchorX,
    anchorY: f.anchorY
  }))

  const cells = renderCells(
    { width: land.width, height: land.height },
    factoryDTOs,
    slotDTOs
  )
  const cell = cells.find((c) => c.x === x && c.y === y)
  if (!cell) return null
  return { land: { id: land.id, index: land.index }, cell }
}
