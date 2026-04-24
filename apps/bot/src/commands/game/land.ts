/**
 * `/land` 커맨드.
 *
 * 서브커맨드:
 * - `view`: 호출자의 토지(4×4)를 이모지 그리드로 렌더링해서 ephemeral Embed로 응답.
 *
 * DB 접근은 `this.container.db` (Prisma 기반 `DatabaseClient`)를 사용한다.
 * 렌더링 자체는 `@structures/renderers`의 순수 함수 `renderLand`에 위임한다.
 *
 * 참조: `docs/design/11-land.md`.
 */

import { Command } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  simpleV2Payload,
  simpleContainer,
  V2_ACCENT,
  v2Flags
} from '@utils/ComponentsV2'
import {
  toSuperscript,
  formatBigInt,
  type FactoryDTO
} from '@structures/renderers'
import { prevOwnedIndex, nextOwnedIndex } from '@utils/landNav'
import { UserService } from '../../services/user'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder
} from 'discord.js'
import type { PrismaClient } from '@idle/database'
import { FACTORY_CATALOG, buildCost as _buildCost } from '@idle/game-core'
import type { FactoryType, SlotType } from '@idle/game-core'

// ──────────────────────────────────────────────────────────────
// Prefix 상수 — interaction handler와 공유
// ──────────────────────────────────────────────────────────────

/** `land:view:<index>` 버튼 prefix. */
export const LAND_VIEW_BUTTON_PREFIX = 'land:view:'
/** `land:cell:<landIndex>:<x>:<y>` 버튼 prefix. */
export const LAND_CELL_BUTTON_PREFIX = 'land:cell:'
/** `factory:action:<factoryId>:<verb>` 버튼 prefix. */
export const FACTORY_ACTION_BUTTON_PREFIX = 'factory:action:'
/** `factory:destroy:<factoryId>:<yes|cancel>` 버튼 prefix. */
export const FACTORY_DESTROY_BUTTON_PREFIX = 'factory:destroy:'
/** `land:build:<landIndex>:<x>:<y>` StringSelect prefix. */
export const LAND_BUILD_SELECT_PREFIX = 'land:build:'
/** 건설 타입 Select의 취소 sentinel 값. */
export const LAND_BUILD_CANCEL_VALUE = 'cancel'

// ──────────────────────────────────────────────────────────────
// 내부 유틸
// ──────────────────────────────────────────────────────────────

/** 특수 슬롯 타입 → 이모지 (LandRenderer와 동일, export 불가로 복제). */
const SPECIAL_SLOT_EMOJI: Readonly<
  Record<Exclude<SlotType, 'NORMAL'>, string>
> = {
  FERTILE: '🌱',
  FOREST: '🌳',
  OIL: '🛢️',
  ORE: '🪨',
  WATER: '💧'
}

// ──────────────────────────────────────────────────────────────
// 공유 페이로드 빌더 — interaction handler에서 import
// ──────────────────────────────────────────────────────────────

/**
 * `/land view` 또는 네비게이션 update용 페이로드를 빌드한다.
 *
 * 4×4 버튼 그리드(4행) + prev/next 네비게이션 행을 Container 하나로 묶어 반환한다.
 * 모든 handler가 `interaction.update(payload as InteractionUpdateOptions)` 형태로 쓴다.
 */
export async function buildLandViewPayload(
  db: PrismaClient,
  opts: { userId: string; targetIndex: number; t: TFunction }
): Promise<{ components: ContainerBuilder[]; flags: number }> {
  const { userId, targetIndex, t } = opts

  const lands = await db.land.findMany({
    where: { userId },
    include: { slots: true },
    orderBy: { index: 'asc' }
  })

  const ownedIndices = lands.map((l) => l.index)
  const land = lands.find((l) => l.index === targetIndex)

  if (!land) {
    return {
      components: [
        simpleContainer(
          V2_ACCENT.error,
          undefined,
          t('game:land.view.error.landNotFound')
        )
      ],
      flags: v2Flags(true)
    }
  }

  // 이 토지의 슬롯이 점유한 공장 ID 목록
  const factoryIds = [
    ...new Set(land.slots.filter((s) => s.factoryId).map((s) => s.factoryId!))
  ]
  const factories =
    factoryIds.length > 0
      ? await db.factory.findMany({
          where: { id: { in: factoryIds } },
          select: {
            id: true,
            type: true,
            grade: true,
            anchorX: true,
            anchorY: true,
            width: true,
            height: true
          }
        })
      : []

  // 점유 셀 → 공장 매핑
  const occupancy = new Map<
    string,
    { id: string; type: FactoryType; grade: number; isAnchor: boolean }
  >()
  for (const f of factories) {
    for (let dy = 0; dy < f.height; dy++) {
      for (let dx = 0; dx < f.width; dx++) {
        occupancy.set(`${f.anchorX + dx},${f.anchorY + dy}`, {
          id: f.id,
          type: f.type,
          grade: f.grade,
          isAnchor: dx === 0 && dy === 0
        })
      }
    }
  }

  const slotMap = new Map<string, { x: number; y: number; type: SlotType }>()
  for (const s of land.slots) slotMap.set(`${s.x},${s.y}`, s)

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:land.view.title')} [${targetIndex}]**`
    )
  )

  // 4×4 버튼 그리드 (y행 × x열)
  for (let y = 0; y < land.height; y++) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (let x = 0; x < land.width; x++) {
      const key = `${x},${y}`
      const occ = occupancy.get(key)
      const slot = slotMap.get(key)
      const btn = new ButtonBuilder().setCustomId(
        `${LAND_CELL_BUTTON_PREFIX}${targetIndex}:${x}:${y}`
      )
      if (occ) {
        const entry = FACTORY_CATALOG[occ.type]
        if (occ.isAnchor) {
          btn
            .setLabel(`${entry.emoji}${toSuperscript(occ.grade)}`)
            .setStyle(ButtonStyle.Primary)
        } else {
          btn
            .setLabel(entry.emoji)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        }
      } else if (slot && slot.type !== 'NORMAL') {
        btn
          .setLabel(
            SPECIAL_SLOT_EMOJI[slot.type as Exclude<SlotType, 'NORMAL'>]
          )
          .setStyle(ButtonStyle.Secondary)
      } else {
        btn.setLabel('⬜').setStyle(ButtonStyle.Secondary)
      }
      row.addComponents(btn)
    }
    container.addActionRowComponents(row)
  }

  // prev/next 네비게이션 행
  const prev = prevOwnedIndex(ownedIndices, targetIndex)
  const next = nextOwnedIndex(ownedIndices, targetIndex)
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${prev ?? targetIndex}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(prev === null),
      new ButtonBuilder()
        .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${next ?? targetIndex}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(next === null)
    )
  )

  return { components: [container], flags: v2Flags(true) }
}

/**
 * 특정 (x, y) 셀의 종류를 판별해 반환한다.
 *
 * 반환값:
 * - `null` — 토지/슬롯이 존재하지 않음
 * - `{ cell: { kind: 'empty' | 'special' }, land }` — 비어있는 슬롯
 * - `{ cell: { kind: 'factory-anchor' | 'factory-body', factory }, land }` — 공장 점유 셀
 */
export async function resolveLandCell(
  db: PrismaClient,
  userId: string,
  landIndex: number,
  x: number,
  y: number
): Promise<{
  cell: {
    kind: 'empty' | 'special' | 'factory-anchor' | 'factory-body'
    factory?: FactoryDTO
  }
  land: { id: string }
} | null> {
  const land = await db.land.findUnique({
    where: { userId_index: { userId, index: landIndex } },
    include: { slots: true }
  })
  if (!land) return null

  const slot = land.slots.find((s) => s.x === x && s.y === y)
  if (!slot) return null

  if (!slot.factoryId) {
    const kind =
      slot.type !== 'NORMAL' ? ('special' as const) : ('empty' as const)
    return { cell: { kind }, land: { id: land.id } }
  }

  const factory = await db.factory.findUnique({
    where: { id: slot.factoryId },
    select: { type: true, grade: true, anchorX: true, anchorY: true }
  })
  if (!factory) return { cell: { kind: 'empty' }, land: { id: land.id } }

  const isAnchor = factory.anchorX === x && factory.anchorY === y
  return {
    cell: {
      kind: isAnchor ? 'factory-anchor' : 'factory-body',
      factory: {
        type: factory.type,
        grade: factory.grade,
        anchorX: factory.anchorX,
        anchorY: factory.anchorY
      }
    },
    land: { id: land.id }
  }
}

/**
 * 공장 철거 2단계 확인 페이로드를 빌드한다.
 *
 * yes → `factory:destroy:<factoryId>:yes`,
 * cancel → `factory:destroy:<factoryId>:cancel`
 */
export function buildDestroyConfirmPayload(opts: {
  factoryId: string
  factoryType: FactoryType
  refund: bigint
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { factoryId, factoryType, refund, t } = opts
  const entry = FACTORY_CATALOG[factoryType]
  const container = simpleContainer(
    V2_ACCENT.warn,
    t('game:factory.destroy.confirmTitle', {
      emoji: entry.emoji,
      type: factoryType
    }),
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
  return { components: [container], flags: v2Flags(true) }
}

/**
 * 빈 셀 클릭 시 노출되는 건설 타입 StringSelect 페이로드.
 *
 * `unlockLevel <= userLevel`인 공장 타입만 옵션으로 노출한다.
 * customId: `land:build:<landIndex>:<x>:<y>`
 */
export function buildBuildTypeSelectPayload(opts: {
  userLevel: number
  landIndex: number
  x: number
  y: number
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { userLevel, landIndex, x, y, t } = opts
  const available = Object.values(FACTORY_CATALOG).filter(
    (entry) => entry.unlockLevel <= userLevel
  )
  const options = available.map((entry) =>
    new StringSelectMenuOptionBuilder()
      .setValue(entry.type)
      .setLabel(`${entry.emoji} ${entry.type}`)
      .setDescription(`Lv${entry.unlockLevel}`)
  )
  options.push(
    new StringSelectMenuOptionBuilder()
      .setValue(LAND_BUILD_CANCEL_VALUE)
      .setLabel(t('game:land.build.cancel'))
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_BUILD_SELECT_PREFIX}${landIndex}:${x}:${y}`)
    .setPlaceholder(t('game:land.build.placeholder'))
    .addOptions(options)
  const container = simpleContainer(V2_ACCENT.info, t('game:land.build.title'))
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return { components: [container], flags: v2Flags(true) }
}

/**
 * 공장 앵커 셀 클릭 시 노출되는 액션 메뉴 페이로드.
 *
 * info/harvest/upgrade/destroy 버튼 + 뒤로가기 버튼.
 * customId: `factory:action:<factoryId>:<verb>`
 */
export function buildFactoryActionMenuPayload(opts: {
  factoryId: string
  landIndex: number
  factoryType: FactoryType
  grade: number
  anchorX: number
  anchorY: number
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { factoryId, landIndex, factoryType, grade, t } = opts
  const entry = FACTORY_CATALOG[factoryType]
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.factory.actionTitle', {
      emoji: entry.emoji,
      type: factoryType,
      grade
    })
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:info`)
        .setLabel(t('game:land.factory.actionInfo'))
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:harvest`)
        .setLabel(t('game:land.factory.actionHarvest'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:upgrade`)
        .setLabel(t('game:land.factory.actionUpgrade'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${FACTORY_ACTION_BUTTON_PREFIX}${factoryId}:destroy`)
        .setLabel(t('game:land.factory.actionDestroy'))
        .setStyle(ButtonStyle.Danger)
    )
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${landIndex}`)
        .setLabel(t('game:land.factory.actionBack'))
        .setStyle(ButtonStyle.Secondary)
    )
  )
  return { components: [container], flags: v2Flags(true) }
}

// ──────────────────────────────────────────────────────────────
// LandCommand
// ──────────────────────────────────────────────────────────────

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
   * 1. `UserService.ensure`로 유저/토지/창고를 보장한다.
   * 2. `buildLandViewPayload`로 4×4 버튼 그리드 페이로드를 빌드한다.
   * 3. ephemeral 응답.
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

    const payload = await buildLandViewPayload(db, {
      userId: hydrated.id,
      targetIndex: 1,
      t
    })

    return interaction.reply(payload as Parameters<typeof interaction.reply>[0])
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
