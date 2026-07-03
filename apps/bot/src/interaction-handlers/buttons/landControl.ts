/**
 * `/land view` 컨트롤 Row 5 버튼 통합 핸들러.
 *
 * customId 포맷: `land:ctrl:<ownerId>:<action>:<landIndex>`
 *   action ∈ { refresh, build, move, destroy, expand }
 *
 * 각 action 별로 다음 UI 로 같은 메시지를 `interaction.update` 한다:
 * - refresh  → `buildLandViewPayload` 재렌더
 * - build    → `buildEmptyCellPickSelectPayload` (활성 빈 셀 선택)
 * - destroy  → `buildFactoryPickSelectPayload` (설치된 공장 선택)
 * - expand   → `buildLockedSlotPickSelectPayload` (잠긴 슬롯 선택)
 * - move     → `buildMoveFactoryPickSelectPayload` (이동할 공장 선택 → 목적지 → 확인)
 *
 * 참조: `docs/design/11-land.md` §Discord 시각화, §공장 이동.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import {
  LAND_CONTROL_ACTIONS,
  LAND_CONTROL_BUTTON_PREFIX,
  buildEmptyCellPickSelectPayload,
  buildFactoryPickSelectPayload,
  buildLandViewPayload,
  buildLockedSlotPickSelectPayload,
  type LandControlAction
} from '../../commands/game/land'
import { buildMoveFactoryPickSelectPayload } from '../../commands/game/landMove'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

const ACTION_SET = new Set<string>(LAND_CONTROL_ACTIONS)

function isAction(value: string): value is LandControlAction {
  return ACTION_SET.has(value)
}

export class LandControlButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button
    })
  }

  public override parse(interaction: ButtonInteraction) {
    const parsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      LAND_CONTROL_BUTTON_PREFIX
    )
    if (!parsed) return this.none()
    const [action, landRaw] = parsed.rest.split(':')
    if (!action || !isAction(action)) return this.none()
    const landIndex = Number.parseInt(landRaw ?? '', 10)
    if (!Number.isInteger(landIndex) || landIndex < 1) return this.none()
    return this.some({ ownerId: parsed.ownerId, action, landIndex })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { ownerId: string; action: LandControlAction; landIndex: number }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)
    const userId = interaction.user.id
    const { landIndex, action } = data

    if (action === 'refresh') {
      const payload = await buildLandViewPayload(db, {
        userId,
        targetIndex: landIndex,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    const land = await db.land.findUnique({
      where: { userId_index: { userId, index: landIndex } },
      include: { slots: true }
    })
    if (!land) {
      await interaction.editReply({
        components: [
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:land.view.error.landNotFound')
          )
        ]
      })
      return
    }

    if (action === 'move') {
      const factoryIds = [
        ...new Set(
          land.slots.filter((s) => s.factoryId).map((s) => s.factoryId!)
        )
      ]
      const factories =
        factoryIds.length === 0
          ? []
          : await db.factory.findMany({
              where: { id: { in: factoryIds } },
              select: {
                id: true,
                type: true,
                grade: true,
                anchorX: true,
                anchorY: true
              }
            })
      const payload = buildMoveFactoryPickSelectPayload({
        ownerId: userId,
        landIndex,
        factories,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    if (action === 'build') {
      const emptyCells = land.slots
        .filter((s) => !s.locked && s.factoryId === null)
        .map((s) => ({ x: s.x, y: s.y }))
      const payload = buildEmptyCellPickSelectPayload({
        ownerId: userId,
        landIndex,
        emptyCells,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    if (action === 'expand') {
      const locked = land.slots
        .filter((s) => s.locked)
        .map((s) => ({ x: s.x, y: s.y }))
      const alreadyExpanded = land.slots.filter(
        (s) => (s.x >= 3 || s.y >= 3) && !s.locked
      ).length
      const nextOrder = Math.max(1, alreadyExpanded + 1)
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { level: true, money: true }
      })
      const payload = buildLockedSlotPickSelectPayload({
        ownerId: userId,
        landIndex,
        lockedSlots: locked,
        nextOrder,
        userLevel: user?.level ?? 1,
        userMoney: user?.money ?? 0n,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    if (action === 'destroy') {
      const factoryIds = [
        ...new Set(
          land.slots.filter((s) => s.factoryId).map((s) => s.factoryId!)
        )
      ]
      const factories =
        factoryIds.length === 0
          ? []
          : await db.factory.findMany({
              where: { id: { in: factoryIds } },
              select: {
                id: true,
                type: true,
                grade: true,
                anchorX: true,
                anchorY: true
              }
            })
      const payload = buildFactoryPickSelectPayload({
        ownerId: userId,
        landIndex,
        factories,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }
  }
}
