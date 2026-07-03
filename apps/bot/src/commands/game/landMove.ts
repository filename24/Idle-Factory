/**
 * `/land move` (공장 이동) 전용 Components v2 페이로드 빌더 모음.
 *
 * `land.ts` 커맨드 파일이 이미 800줄 상한을 넘겨(1,100줄+), 이동 플로우 UI 는 이 파일로 분리한다.
 * 플로우: [이동] 컨트롤 버튼 → 이동할 공장 선택 → 목적지 슬롯 선택 → 비용 확인 → 확인 버튼.
 *
 * 참조: `docs/design/11-land.md` §공장 이동 · 철거, `.claude/skills/componentsv2-builder/SKILL.md`.
 */

import type { TFunction } from '@sapphire/plugin-i18next'
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
import type { FactoryType } from '@idle/database'
import {
  canPlace,
  FACTORY_CATALOG,
  moveCost,
  type SlotState
} from '@idle/game-core'
import { simpleContainer, V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { localizeFactoryType } from '@utils/enumLocale'
import { LAND_VIEW_BUTTON_PREFIX } from './land'

// ──────────────────────────────────────────────────────────────
// customId prefix — interaction handler 와 공유
// ──────────────────────────────────────────────────────────────

/** 이동할 공장 Select — `land:mv-pick:<ownerId>:<landIndex>`. value = factoryId. */
export const LAND_MOVE_PICK_SELECT_PREFIX = 'land:mv-pick:'
/** 목적지 슬롯 Select — `land:mv-dest:<ownerId>:<landIndex>:<factoryId>`. value = `"x,y"`. */
export const LAND_MOVE_DEST_SELECT_PREFIX = 'land:mv-dest:'
/**
 * 이동 확인 버튼 — `land:mv-go:<ownerId>:<landIndex>:<factoryId>:<x>:<y>:<decision>`.
 * decision ∈ { yes, cancel }. factoryId(cuid) 에는 `:` 가 없어 split 파싱이 안전하다.
 */
export const LAND_MOVE_CONFIRM_BUTTON_PREFIX = 'land:mv-go:'

/** Discord StringSelect 옵션 최대 개수 (한 메시지 4×4 = 16개라 실제로는 초과하지 않음). */
const MAX_SELECT_OPTIONS = 25

// ──────────────────────────────────────────────────────────────
// 배치 후보 계산 (순수 함수)
// ──────────────────────────────────────────────────────────────

/**
 * 특정 공장을 이동시킬 수 있는 목적지 앵커 좌표 목록을 계산한다.
 *
 * 대상 공장이 현재 점유한 셀을 비운 가상 상태에서 4×4 전 좌표를 `canPlace` 로 검사하며,
 * **현재 앵커와 동일한 위치는 제외**한다(무의미한 이동 방지). T3(2×2)는 4셀 경계·잠금·점유를
 * 모두 만족하는 좌상단 앵커만 반환한다.
 *
 * @returns 배치 가능한 목적지 앵커 좌표 배열 (좌→우, 상→하 순)
 */
export function listMoveAnchors(opts: {
  landWidth: number
  landHeight: number
  slots: ReadonlyArray<{
    x: number
    y: number
    type: SlotState['type']
    locked: boolean
    factoryId: string | null
  }>
  factory: { id: string; type: FactoryType; anchorX: number; anchorY: number }
}): Array<{ x: number; y: number }> {
  const { landWidth, landHeight, slots, factory } = opts
  const virtual: SlotState[] = slots.map((s) => ({
    x: s.x,
    y: s.y,
    type: s.type,
    locked: s.locked,
    factoryId: s.factoryId === factory.id ? null : s.factoryId
  }))

  const anchors: Array<{ x: number; y: number }> = []
  for (let y = 0; y < landHeight; y++) {
    for (let x = 0; x < landWidth; x++) {
      if (x === factory.anchorX && y === factory.anchorY) continue
      if (
        canPlace({
          landWidth,
          landHeight,
          slots: virtual,
          type: factory.type,
          anchorX: x,
          anchorY: y
        }).ok
      ) {
        anchors.push({ x, y })
      }
    }
  }
  return anchors
}

// ──────────────────────────────────────────────────────────────
// 페이로드 빌더
// ──────────────────────────────────────────────────────────────

/** 그리드로 돌아가는 버튼 한 개짜리 Row (이동 UI 하단 공통). */
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

/** Small divider 를 Container 에 추가 (텍스트 ↔ 인터랙티브 사이 필수 구분선). */
function addSmallDivider(container: ContainerBuilder): void {
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )
}

/**
 * 컨트롤 Row `[이동]` 클릭 시 노출되는 "이동할 공장 선택" StringSelect.
 *
 * 해당 토지에 배치된 공장 목록을 옵션으로 제시. 선택 시 목적지 선택 단계로 넘어간다.
 */
export function buildMoveFactoryPickSelectPayload(opts: {
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
    V2_ACCENT.info,
    t('game:land.control.movePickTitle')
  )

  if (factories.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:land.control.movePickEmpty'))
    )
    addSmallDivider(container)
    container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
    return { components: [container], flags: v2Flags(false) }
  }

  const options = factories.slice(0, MAX_SELECT_OPTIONS).map((f) =>
    new StringSelectMenuOptionBuilder()
      .setValue(f.id)
      .setEmoji(FACTORY_CATALOG[f.type].emoji)
      .setLabel(`${localizeFactoryType(t, f.type)} G${f.grade}`)
      .setDescription(`(${f.anchorX}, ${f.anchorY})`)
  )
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${LAND_MOVE_PICK_SELECT_PREFIX}${ownerId}:${landIndex}`)
    .setPlaceholder(t('game:land.control.movePickPlaceholder'))
    .addOptions(options)

  addSmallDivider(container)
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
  return { components: [container], flags: v2Flags(false) }
}

/**
 * "목적지 슬롯 선택" StringSelect.
 *
 * 이동 비용(신축비 25%)을 본문에 안내하고, `listMoveAnchors` 로 계산한 배치 가능 좌표를 옵션으로 제시.
 */
export function buildMoveDestPickSelectPayload(opts: {
  ownerId: string
  landIndex: number
  factoryId: string
  factoryType: FactoryType
  anchors: ReadonlyArray<{ x: number; y: number }>
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const { ownerId, landIndex, factoryId, factoryType, anchors, t } = opts
  const entry = FACTORY_CATALOG[factoryType]
  const container = simpleContainer(
    V2_ACCENT.info,
    t('game:land.move.destTitle', {
      emoji: entry.emoji,
      type: localizeFactoryType(t, factoryType)
    }),
    t('game:land.move.destBody', { cost: formatBigInt(moveCost(factoryType)) })
  )

  if (anchors.length === 0) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(t('game:land.move.destEmpty'))
    )
    addSmallDivider(container)
    container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
    return { components: [container], flags: v2Flags(false) }
  }

  const options = anchors
    .slice(0, MAX_SELECT_OPTIONS)
    .map((c) =>
      new StringSelectMenuOptionBuilder()
        .setValue(`${c.x},${c.y}`)
        .setEmoji('🟩')
        .setLabel(`(${c.x}, ${c.y})`)
    )
  const select = new StringSelectMenuBuilder()
    .setCustomId(
      `${LAND_MOVE_DEST_SELECT_PREFIX}${ownerId}:${landIndex}:${factoryId}`
    )
    .setPlaceholder(t('game:land.move.destPlaceholder'))
    .addOptions(options)

  addSmallDivider(container)
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)
  )
  container.addActionRowComponents(backToViewRow(ownerId, landIndex, t))
  return { components: [container], flags: v2Flags(false) }
}

/**
 * 이동 확인 페이로드 — 이동 전/후 좌표와 비용을 보여주고 확인/취소 버튼을 배치한다.
 *
 * yes → `land:mv-go:<ownerId>:<landIndex>:<factoryId>:<x>:<y>:yes`,
 * cancel → 같은 형식의 `:cancel`.
 */
export function buildMoveConfirmPayload(opts: {
  ownerId: string
  landIndex: number
  factoryId: string
  factoryType: FactoryType
  fromX: number
  fromY: number
  toX: number
  toY: number
  t: TFunction
}): { components: ContainerBuilder[]; flags: number } {
  const {
    ownerId,
    landIndex,
    factoryId,
    factoryType,
    fromX,
    fromY,
    toX,
    toY,
    t
  } = opts
  const entry = FACTORY_CATALOG[factoryType]
  const container = simpleContainer(
    V2_ACCENT.warn,
    t('game:land.move.confirmTitle', {
      emoji: entry.emoji,
      type: localizeFactoryType(t, factoryType)
    }),
    t('game:land.move.confirmBody', {
      fromX,
      fromY,
      toX,
      toY,
      cost: formatBigInt(moveCost(factoryType))
    })
  )
  addSmallDivider(container)
  const base = `${LAND_MOVE_CONFIRM_BUTTON_PREFIX}${ownerId}:${landIndex}:${factoryId}:${toX}:${toY}`
  container.addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${base}:yes`)
        .setLabel(t('game:land.move.confirmYes'))
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${base}:cancel`)
        .setLabel(t('game:land.move.confirmCancel'))
        .setStyle(ButtonStyle.Secondary)
    )
  )
  return { components: [container], flags: v2Flags(false) }
}

/**
 * `ServiceError.code` → 이동 실패 사용자 문구 키를 해석한다.
 *
 * 이동 확인 핸들러에서 재사용. 미지의 코드는 공용 unknown 문구로 폴백한다.
 *
 * @param code `ServiceError.code`
 * @param t i18next 번역 함수
 * @param details `ServiceError.details` — `INSUFFICIENT_MONEY` 의 `{ required }` 보간에 사용
 */
export function resolveMoveErrorBody(
  code: string,
  t: TFunction,
  details?: unknown
): string {
  switch (code) {
    case 'FACTORY_NOT_FOUND':
      return t('game:common.error.factoryNotFound')
    case 'LAND_NOT_FOUND':
      return t('game:land.view.error.landNotFound')
    case 'OUT_OF_BOUNDS':
      return t('game:land.move.error.outOfBounds')
    case 'SLOT_LOCKED':
      return t('game:land.move.error.slotLocked')
    case 'SLOT_OCCUPIED':
      return t('game:land.move.error.slotOccupied')
    case 'MOVE_SAME_POSITION':
      return t('game:land.move.error.samePosition')
    case 'INSUFFICIENT_MONEY': {
      // 확인/성공 문구와 동일하게 천 단위 구분 포맷으로 표기한다 (예: "25,000").
      const d = (details ?? {}) as { required?: string }
      const required =
        d.required && /^\d+$/.test(d.required)
          ? formatBigInt(BigInt(d.required))
          : (d.required ?? '-')
      return t('game:land.move.error.insufficientMoney', { required })
    }
    case 'USER_NOT_FOUND':
      return t('game:common.error.userNotFound')
    default:
      return t('game:common.error.unknown')
  }
}
