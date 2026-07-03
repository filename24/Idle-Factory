/**
 * `/land` 커맨드.
 *
 * 서브커맨드:
 * - `view`: 호출자의 토지(4×4)를 이모지 그리드로 렌더링해서 공개 응답.
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
  renderFactoryInfo,
  type FactoryDTO,
  type FactoryInfoDTO,
  type NextUpgradeCost
} from '@structures/renderers'
import { localizeFactoryType } from '@utils/enumLocale'
import { prevOwnedIndex, nextOwnedIndex } from '@utils/landNav'
import { UserService } from '../../services/user'
import {
  LandService,
  MAX_BUYABLE_INDEX,
  MIN_BUYABLE_INDEX
} from '../../services/land'
import { ServiceError } from '../../services/base'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder
} from 'discord.js'
import type { PrismaClient } from '@idle/database'
import {
  FACTORY_CATALOG,
  LAND_MAX_HEIGHT,
  LAND_MAX_WIDTH,
  buildCost as _buildCost,
  landExpansionCost,
  landExpansionLevelRequirement
} from '@idle/game-core'
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

/**
 * 컨트롤 Row 버튼 prefix — `land:ctrl:<ownerId>:<action>:<landIndex>`.
 *
 * action ∈ { refresh, build, move, destroy, expand }. (docs/11-land.md §컨트롤 Row)
 */
export const LAND_CONTROL_BUTTON_PREFIX = 'land:ctrl:'

/** 빈 셀 Select — `land:pick-cell:<ownerId>:<landIndex>` (건설 시작용). value = `"x,y"`. */
export const LAND_PICK_CELL_SELECT_PREFIX = 'land:pick-cell:'
/** 잠긴 슬롯 Select — `land:pick-locked:<ownerId>:<landIndex>` (확장용). value = `"x,y"`. */
export const LAND_PICK_LOCKED_SELECT_PREFIX = 'land:pick-locked:'
/** 공장 Select — `land:pick-factory:<ownerId>:<landIndex>` (철거용). value = factoryId. */
export const LAND_PICK_FACTORY_SELECT_PREFIX = 'land:pick-factory:'

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
  // ownerId(=userId) 는 모든 버튼 customId에 박아넣어 다른 유저의 조작을 차단한다.
  const ownerId = userId

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
      flags: v2Flags(false)
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

  const slotMap = new Map<
    string,
    { x: number; y: number; type: SlotType; locked: boolean }
  >()
  for (const s of land.slots)
    slotMap.set(`${s.x},${s.y}`, {
      x: s.x,
      y: s.y,
      type: s.type,
      locked: s.locked
    })

  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('game:land.view.title', {
        index: targetIndex,
        total: ownedIndices.length
      })}**`
    )
  )

  // 항상 4×4 물리 그리드 렌더. 잠긴 슬롯은 disabled 🟫 로 표시 (docs/11 §Discord 시각화).
  for (let y = 0; y < LAND_MAX_HEIGHT; y++) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (let x = 0; x < LAND_MAX_WIDTH; x++) {
      const key = `${x},${y}`
      const occ = occupancy.get(key)
      const slot = slotMap.get(key)
      const btn = new ButtonBuilder().setCustomId(
        `${LAND_CELL_BUTTON_PREFIX}${ownerId}:${targetIndex}:${x}:${y}`
      )
      if (slot?.locked) {
        // 잠긴 슬롯: 구매 전이라 배치 불가 — 클릭은 /land expand 쪽에서 처리.
        btn.setEmoji('🟫').setStyle(ButtonStyle.Secondary).setDisabled(true)
      } else if (occ) {
        const entry = FACTORY_CATALOG[occ.type]
        if (occ.isAnchor) {
          btn
            .setEmoji(entry.emoji)
            .setLabel(toSuperscript(occ.grade))
            .setStyle(ButtonStyle.Primary)
        } else {
          btn
            .setEmoji(entry.emoji)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        }
      } else if (slot && slot.type !== 'NORMAL') {
        btn
          .setEmoji(
            SPECIAL_SLOT_EMOJI[slot.type as Exclude<SlotType, 'NORMAL'>]
          )
          .setStyle(ButtonStyle.Secondary)
      } else {
        btn.setEmoji('🟩').setStyle(ButtonStyle.Secondary)
      }
      row.addComponents(btn)
    }
    container.addActionRowComponents(row)
  }

  // 범례: 슬롯 이모지의 의미를 한 줄로 안내.
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${t('game:land.view.legend')}`)
  )

  // 그리드와 컨트롤 Row 사이 구분선 (docs/11 §Discord 시각화).
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Large)
  )

  // 컨트롤 Row (docs/11 §Discord 시각화).
  // Discord 한도(5행 × 5버튼)상 그리드 4행 + separator + 컨트롤 1행 구성 — 단일/다중 토지에 따라 레이아웃 전환.
  const prev = prevOwnedIndex(ownedIndices, targetIndex)
  const next = nextOwnedIndex(ownedIndices, targetIndex)
  const hasMultiple = ownedIndices.length > 1
  const controlRow = new ActionRowBuilder<ButtonBuilder>()

  if (hasMultiple) {
    // 다중 토지: [◀️] [🏗️ 건설] [🗑️ 철거] [🟩 확장] [▶️]
    controlRow.addComponents(
      new ButtonBuilder()
        .setCustomId(
          `${LAND_VIEW_BUTTON_PREFIX}${ownerId}:${prev ?? `prev-${targetIndex}`}`
        )
        .setEmoji('◀️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(prev === null),
      controlButton(
        ownerId,
        'build',
        targetIndex,
        t,
        '🏗️',
        ButtonStyle.Primary
      ),
      controlButton(
        ownerId,
        'destroy',
        targetIndex,
        t,
        '🗑️',
        ButtonStyle.Danger
      ),
      controlButton(
        ownerId,
        'expand',
        targetIndex,
        t,
        '🟩',
        ButtonStyle.Success
      ),
      new ButtonBuilder()
        .setCustomId(
          `${LAND_VIEW_BUTTON_PREFIX}${ownerId}:${next ?? `next-${targetIndex}`}`
        )
        .setEmoji('▶️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(next === null)
    )
  } else {
    // 단일 토지: [🔄 새로고침] [🏗️ 건설] [↔️ 이동] [🗑️ 철거] [🟩 확장]
    controlRow.addComponents(
      controlButton(
        ownerId,
        'refresh',
        targetIndex,
        t,
        '🔄',
        ButtonStyle.Secondary
      ),
      controlButton(
        ownerId,
        'build',
        targetIndex,
        t,
        '🏗️',
        ButtonStyle.Primary
      ),
      controlButton(
        ownerId,
        'move',
        targetIndex,
        t,
        '↔️',
        ButtonStyle.Secondary
      ),
      controlButton(
        ownerId,
        'destroy',
        targetIndex,
        t,
        '🗑️',
        ButtonStyle.Danger
      ),
      controlButton(
        ownerId,
        'expand',
        targetIndex,
        t,
        '🟩',
        ButtonStyle.Success
      )
    )
  }
  container.addActionRowComponents(controlRow)

  return { components: [container], flags: v2Flags(false) }
}

/** 컨트롤 Row 의 단일 유틸 버튼 빌더. */
function controlButton(
  ownerId: string,
  action: LandControlAction,
  landIndex: number,
  t: TFunction,
  emoji: string,
  style: ButtonStyle
): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(
      `${LAND_CONTROL_BUTTON_PREFIX}${ownerId}:${action}:${landIndex}`
    )
    .setEmoji(emoji)
    .setLabel(t(`game:land.control.${action}`))
    .setStyle(style)
}

/** 컨트롤 Row 에서 허용되는 action. */
export type LandControlAction =
  | 'refresh'
  | 'build'
  | 'move'
  | 'destroy'
  | 'expand'

/** `LandControlAction` 판별. */
export const LAND_CONTROL_ACTIONS: readonly LandControlAction[] = [
  'refresh',
  'build',
  'move',
  'destroy',
  'expand'
]

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
  ownerId: string
  factoryId: string
  factoryType: FactoryType
  refund: bigint
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, factoryId, factoryType, refund, t } = opts
  const entry = FACTORY_CATALOG[factoryType]
  const container = simpleContainer(
    V2_ACCENT.warn,
    t('game:factory.destroy.confirmTitle', {
      emoji: entry.emoji,
      type: localizeFactoryType(t, factoryType)
    }),
    t('game:factory.destroy.confirmBody', { refund: formatBigInt(refund) })
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `${FACTORY_DESTROY_BUTTON_PREFIX}${ownerId}:${factoryId}:yes`
        )
        .setLabel(t('game:factory.destroy.confirmYes'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(
          `${FACTORY_DESTROY_BUTTON_PREFIX}${ownerId}:${factoryId}:cancel`
        )
        .setLabel(t('game:factory.destroy.confirmCancel'))
        .setStyle(ButtonStyle.Secondary)
    )
  )
  return { components: [container], flags: v2Flags(false) }
}

/** `(x, y)` 형식의 Select 값을 파싱. */
export function parseXYValue(value: string): { x: number; y: number } | null {
  const [xRaw, yRaw] = value.split(',')
  const x = Number.parseInt(xRaw ?? '', 10)
  const y = Number.parseInt(yRaw ?? '', 10)
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x, y }
}

/**
 * 컨트롤 Row `[건설]` 클릭 시 노출되는 "빈 셀 선택" StringSelect.
 *
 * 활성(non-locked) 빈 셀을 전부 옵션으로 제시. 선택하면 `landBuild` select 로 전환되는
 * 대신 곧바로 `LAND_CELL_BUTTON_PREFIX` 와 동일한 경로로 이어지도록,
 * value 에 좌표 `"x,y"` 만 담고 핸들러에서 기존 build-type select 를 빌드한다.
 */
export function buildEmptyCellPickSelectPayload(opts: {
  ownerId: string
  landIndex: number
  emptyCells: ReadonlyArray<{ x: number; y: number }>
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, landIndex, emptyCells, t } = opts
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.control.buildPickTitle')
  )
  if (emptyCells.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:land.control.buildPickEmpty'))
    )
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
    return { components: [container], flags: v2Flags(false) }
  }

  const options = emptyCells
    .slice(0, 24)
    .map((c) =>
      new StringSelectMenuOptionBuilder()
        .setValue(`${c.x},${c.y}`)
        .setEmoji('🟩')
        .setLabel(`(${c.x}, ${c.y})`)
    )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_PICK_CELL_SELECT_PREFIX}${ownerId}:${landIndex}`)
    .setPlaceholder(t('game:land.control.buildPickPlaceholder'))
    .addOptions(options)
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
  return { components: [container], flags: v2Flags(false) }
}

/**
 * 컨트롤 Row `[확장]` 클릭 시 노출되는 "잠긴 슬롯 선택" StringSelect.
 *
 * 각 잠긴 슬롯은 "(x,y) · k번째 확장 · 비용 · Lv요구" 형태로 표시. 선택 시
 * `LandService.expandSlot` 을 호출한다.
 */
export function buildLockedSlotPickSelectPayload(opts: {
  ownerId: string
  landIndex: number
  lockedSlots: ReadonlyArray<{ x: number; y: number }>
  /** 다음 확장의 구매 순서(k, 1..7). 0개면 전부 해금 상태. */
  nextOrder: number
  userLevel: number
  userMoney: bigint
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, landIndex, lockedSlots, nextOrder, t } = opts
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.control.expandPickTitle')
  )

  if (lockedSlots.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:land.control.expandPickAllUnlocked')
      )
    )
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
    return { components: [container], flags: v2Flags(false) }
  }

  const cost = landExpansionCost(landIndex, nextOrder)
  const levelReq = landExpansionLevelRequirement(landIndex, nextOrder)
  const options = lockedSlots.slice(0, 24).map((c) =>
    new StringSelectMenuOptionBuilder()
      .setValue(`${c.x},${c.y}`)
      .setEmoji('🟫')
      .setLabel(`(${c.x}, ${c.y})`)
      .setDescription(
        t('game:land.control.expandOptionDesc', {
          order: nextOrder,
          cost: formatBigInt(cost),
          level: levelReq
        })
      )
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_PICK_LOCKED_SELECT_PREFIX}${ownerId}:${landIndex}`)
    .setPlaceholder(t('game:land.control.expandPickPlaceholder'))
    .addOptions(options)
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
  return { components: [container], flags: v2Flags(false) }
}

/**
 * 컨트롤 Row `[철거]` 클릭 시 노출되는 "공장 선택" StringSelect.
 *
 * 해당 토지에 배치된 공장 목록. 선택 시 기존 `buildDestroyConfirmPayload` 로 전환.
 */
export function buildFactoryPickSelectPayload(opts: {
  ownerId: string
  landIndex: number
  factories: ReadonlyArray<{
    id: string
    type: FactoryType
    grade: number
    anchorX: number
    anchorY: number
  }>
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, landIndex, factories, t } = opts
  const container = simpleContainer(
    V2_ACCENT.warn,
    t('game:land.control.destroyPickTitle')
  )
  if (factories.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        t('game:land.control.destroyPickEmpty')
      )
    )
    container.addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
    return { components: [container], flags: v2Flags(false) }
  }

  const options = factories.slice(0, 25).map((f) =>
    new StringSelectMenuOptionBuilder()
      .setValue(f.id)
      .setEmoji(FACTORY_CATALOG[f.type].emoji)
      .setLabel(`${localizeFactoryType(t, f.type)} G${f.grade}`)
      .setDescription(`(${f.anchorX}, ${f.anchorY})`)
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_PICK_FACTORY_SELECT_PREFIX}${ownerId}:${landIndex}`)
    .setPlaceholder(t('game:land.control.destroyPickPlaceholder'))
    .addOptions(options)
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
  return { components: [container], flags: v2Flags(false) }
}

/** 그리드로 돌아가는 버튼 한 개짜리 Row. 모든 pick UI 하단에 공통으로 쓴다. */
function backToViewRow(
  ownerId: string,
  landIndex: number,
  t: TFunction
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${ownerId}:${landIndex}`)
      .setLabel(t('game:land.factory.actionBack'))
      .setStyle(ButtonStyle.Secondary)
  )
}

/**
 * 빈 셀 클릭 시 노출되는 건설 타입 StringSelect 페이로드.
 *
 * `unlockLevel <= userLevel`인 공장 타입만 옵션으로 노출한다.
 * customId: `land:build:<landIndex>:<x>:<y>`
 */
export function buildBuildTypeSelectPayload(opts: {
  ownerId: string
  userLevel: number
  landIndex: number
  x: number
  y: number
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, userLevel, landIndex, x, y, t } = opts
  const available = Object.values(FACTORY_CATALOG).filter(
    (entry) => entry.unlockLevel <= userLevel
  )
  const options = available.map((entry) =>
    new StringSelectMenuOptionBuilder()
      .setValue(entry.type)
      .setEmoji(entry.emoji)
      .setLabel(localizeFactoryType(t, entry.type))
      .setDescription(`Lv${entry.unlockLevel}`)
  )
  options.push(
    new StringSelectMenuOptionBuilder()
      .setValue(LAND_BUILD_CANCEL_VALUE)
      .setLabel(t('game:land.build.cancel'))
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_BUILD_SELECT_PREFIX}${ownerId}:${landIndex}:${x}:${y}`)
    .setPlaceholder(t('game:land.build.placeholder'))
    .addOptions(options)
  const container = simpleContainer(V2_ACCENT.info, t('game:land.build.title'))
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  return { components: [container], flags: v2Flags(false) }
}

/**
 * 공장 앵커 셀 클릭 시 노출되는 액션 메뉴 페이로드.
 *
 * 제목 + 공장 정보 본문(renderFactoryInfo)을 즉시 표시하고, 하단에
 * 수확 / 업그레이드 / 철거 / 뒤로가기 버튼을 배치한다. (정보 버튼은 본문 인라인이라 제거)
 *
 * customId: `factory:action:<ownerId>:<factoryId>:<verb>` — verb ∈ { harvest, upgrade, destroy }
 */
export function buildFactoryActionMenuPayload(opts: {
  ownerId: string
  factoryId: string
  landIndex: number
  info: FactoryInfoDTO
  nextCost: NextUpgradeCost | null
  catalogEntry: (typeof FACTORY_CATALOG)[FactoryType]
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, factoryId, landIndex, info, nextCost, catalogEntry, t } =
    opts
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.factory.actionTitle', {
      emoji: catalogEntry.emoji,
      type: localizeFactoryType(t, info.type),
      grade: info.grade
    }),
    renderFactoryInfo(info, catalogEntry, nextCost, t)
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(
          `${FACTORY_ACTION_BUTTON_PREFIX}${ownerId}:${factoryId}:harvest`
        )
        .setLabel(t('game:land.factory.actionHarvest'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(
          `${FACTORY_ACTION_BUTTON_PREFIX}${ownerId}:${factoryId}:upgrade`
        )
        .setLabel(t('game:land.factory.actionUpgrade'))
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(
          `${FACTORY_ACTION_BUTTON_PREFIX}${ownerId}:${factoryId}:destroy`
        )
        .setLabel(t('game:land.factory.actionDestroy'))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${LAND_VIEW_BUTTON_PREFIX}${ownerId}:${landIndex}`)
        .setLabel(t('game:land.factory.actionBack'))
        .setStyle(ButtonStyle.Secondary)
    )
  )
  return { components: [container], flags: v2Flags(false) }
}

// ──────────────────────────────────────────────────────────────
// LandCommand
// ──────────────────────────────────────────────────────────────

/** 서브커맨드 이름 상수. */
const SUB_VIEW = 'view'
const SUB_BUY = 'buy'
const SUB_EXPAND = 'expand'

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
    if (sub === SUB_EXPAND) {
      return this.handleExpand(interaction)
    }
    return interaction.reply(
      simpleV2Payload({
        accent: V2_ACCENT.error,
        body: 'Unknown subcommand.',
        ephemeral: false
      })
    )
  }

  /**
   * `/land view` 핸들러.
   *
   * 1. `UserService.ensure`로 유저/토지/창고를 보장한다.
   * 2. `buildLandViewPayload`로 4×4 버튼 그리드 페이로드를 빌드한다.
   * 3. 공개 메시지로 응답.
   */
  private async handleView(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    await interaction.deferReply()
    const { db } = this.container
    const t = await fetchT(interaction)
    const requestedIndex =
      interaction.options.getInteger('index', false) ?? null

    const hydrated = await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    const targetIndex =
      requestedIndex ??
      (hydrated.lands.length > 0 ? hydrated.lands[0]!.index : 1)

    const payload = await buildLandViewPayload(db, {
      userId: hydrated.id,
      targetIndex,
      t
    })

    return interaction.editReply(
      payload as Parameters<typeof interaction.editReply>[0]
    )
  }

  /** `/land buy` 핸들러. */
  private async handleBuy(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    await interaction.deferReply()
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
      return interaction.editReply({
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
        ]
      })
    } catch (err) {
      return this.replyBuyError(interaction, err, t)
    }
  }

  /**
   * `/land expand <index?> <x> <y>` — 잠긴 슬롯 하나를 구매해 활성화.
   *
   * 레벨/골드 체크는 `LandService.expandSlot` 가 처리한다. 성공 시 해당 토지의
   * 갱신된 뷰로 응답을 덮어쓰고, 별도로 성공 요약을 followUp으로 공개 전송한다.
   */
  private async handleExpand(
    interaction: Command.ChatInputCommandInteraction
  ): Promise<unknown> {
    await interaction.deferReply()
    const { db } = this.container
    const t = await fetchT(interaction)
    const landIndex = interaction.options.getInteger('index', false) ?? 1
    const x = interaction.options.getInteger('x', true)
    const y = interaction.options.getInteger('y', true)

    await UserService.ensure(db, {
      discordId: interaction.user.id,
      nickname: interaction.user.username,
      lang: interaction.locale ?? undefined
    })

    try {
      const result = await LandService.expandSlot(db, {
        userId: interaction.user.id,
        landIndex,
        x,
        y
      })
      const viewPayload = await buildLandViewPayload(db, {
        userId: interaction.user.id,
        targetIndex: landIndex,
        t
      })
      await interaction.editReply(
        viewPayload as Parameters<typeof interaction.editReply>[0]
      )
      return interaction.followUp({
        components: [
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:land.expand.success', {
              index: landIndex,
              x,
              y,
              order: result.order,
              cost: formatBigInt(result.cost),
              remaining: formatBigInt(result.remainingMoney)
            })
          )
        ],
        flags: v2Flags(false)
      })
    } catch (err) {
      return this.replyExpandError(interaction, err, t)
    }
  }

  private async replyExpandError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    t: TFunction
  ): Promise<unknown> {
    let body: string
    if (err instanceof ServiceError) {
      switch (err.code) {
        case 'LAND_NOT_FOUND':
          body = t('game:factory.build.error.landNotFound')
          break
        case 'OUT_OF_BOUNDS':
          body = t('game:factory.build.error.outOfBounds')
          break
        case 'SLOT_ALREADY_UNLOCKED':
          body = t('game:land.expand.error.alreadyUnlocked')
          break
        case 'LEVEL_LOCKED': {
          const d = (err.details ?? {}) as { level?: number }
          body = t('game:land.expand.error.levelLocked', {
            level: d.level ?? '?'
          })
          break
        }
        case 'INSUFFICIENT_MONEY': {
          const d = (err.details ?? {}) as { required?: string }
          body = t('game:land.expand.error.insufficientMoney', {
            required: d.required ?? '-'
          })
          break
        }
        case 'USER_NOT_FOUND':
          body = t('game:common.error.userNotFound')
          break
        default:
          body = t('game:common.error.unknown')
      }
    } else {
      body = t('game:common.error.unknown')
    }
    return interaction.editReply({
      components: [simpleContainer(V2_ACCENT.warn, undefined, body)]
    })
  }

  private async replyBuyError(
    interaction: Command.ChatInputCommandInteraction,
    err: unknown,
    t: TFunction
  ): Promise<unknown> {
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
          body = t('game:common.error.unknown')
      }
      // 잘못된 번호/중복으로 실패하면 실제 다음 구매 가능 번호를 덧붙여 안내한다 (UX).
      if (
        err.code === 'INVALID_LAND_INDEX' ||
        err.code === 'LAND_ALREADY_EXISTS'
      ) {
        const hint = await this.nextBuyableHint(interaction.user.id, t)
        if (hint) body = `${body}\n${hint}`
      }
    } else {
      body = t('game:common.error.unknown')
    }
    return interaction.editReply({
      components: [simpleContainer(V2_ACCENT.warn, undefined, body)]
    })
  }

  /**
   * 유저의 다음 구매 가능 토지 번호 안내 문구. 이미 최대(5개)면 null.
   *
   * 다음 번호 = 현재 보유 토지 수 + 1 (index 연속성, docs/design/11-land.md).
   */
  private async nextBuyableHint(
    userId: string,
    t: TFunction
  ): Promise<string | null> {
    const owned = await this.container.db.land.count({ where: { userId } })
    const nextIndex = owned + 1
    if (nextIndex < MIN_BUYABLE_INDEX || nextIndex > MAX_BUYABLE_INDEX) {
      return null
    }
    return t('game:land.buy.hintNext', { index: nextIndex })
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
            .setDescription('Show your land as an interactive button grid.')
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
        .addSubcommand((sub) =>
          sub
            .setName(SUB_EXPAND)
            .setDescription('Unlock a single locked slot in a land.')
            .setNameLocalization('ko', '확장')
            .setDescriptionLocalization(
              'ko',
              '잠긴 슬롯을 하나 구매해 확장합니다.'
            )
            .addIntegerOption((o) =>
              o
                .setName('x')
                .setDescription('Slot X coordinate (0-3).')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(3)
            )
            .addIntegerOption((o) =>
              o
                .setName('y')
                .setDescription('Slot Y coordinate (0-3).')
                .setRequired(true)
                .setMinValue(0)
                .setMaxValue(3)
            )
            .addIntegerOption((o) =>
              o
                .setName('index')
                .setDescription('Land number (1-5). Defaults to 1.')
                .setNameLocalization('ko', '번호')
                .setDescriptionLocalization('ko', '대상 토지 번호 (기본 1).')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_BUYABLE_INDEX)
            )
        )
    )
  }
}
