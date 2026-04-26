/**
 * `/land view` 4×4 셀 그리드 버튼 핸들러.
 *
 * customId 포맷: `land:cell:<ownerId>:<landIndex>:<x>:<y>`.
 *
 * 동작:
 * - 호출자(interaction.user.id) != ownerId → ephemeral 경고 후 종료
 * - 빈 셀(`empty`/`special`) → 건설할 공장 타입 StringSelect 로 같은 메시지 update (4b)
 * - 공장 앵커(`factory-anchor`) → info/harvest/upgrade/destroy 액션 메뉴 (4c)
 * - 공장 비앵커(`factory-body`) → 정상 경로로는 도달 불가 (버튼 disabled). 방어적으로 정보 응답
 *
 * 참조: `docs/design/11-land.md`.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { simpleContainer, V2_ACCENT } from '@utils/ComponentsV2'
import { FACTORY_CATALOG, type MaterialType } from '@idle/game-core'
import type { ButtonInteraction } from 'discord.js'
import {
  LAND_CELL_BUTTON_PREFIX,
  buildBuildTypeSelectPayload,
  buildFactoryActionMenuPayload,
  resolveLandCell
} from '../../commands/game/land'
import { FactoryService } from '../../services/factory'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

export class LandCellButtonHandler extends InteractionHandler {
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
      LAND_CELL_BUTTON_PREFIX
    )
    if (!parsed) return this.none()
    const [landRaw, xRaw, yRaw] = parsed.rest.split(':')
    const landIndex = Number.parseInt(landRaw ?? '', 10)
    const x = Number.parseInt(xRaw ?? '', 10)
    const y = Number.parseInt(yRaw ?? '', 10)
    if (
      !Number.isInteger(landIndex) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y)
    ) {
      return this.none()
    }
    return this.some({ ownerId: parsed.ownerId, landIndex, x, y })
  }

  public async run(
    interaction: ButtonInteraction,
    data: { ownerId: string; landIndex: number; x: number; y: number }
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    await interaction.deferUpdate()
    const { db } = this.container
    const t = await fetchT(interaction)

    const resolved = await resolveLandCell(
      db,
      interaction.user.id,
      data.landIndex,
      data.x,
      data.y
    )
    if (!resolved) {
      await interaction.editReply({
        components: [
          simpleContainer(
            V2_ACCENT.error,
            undefined,
            t('game:land.view.error.cellNotFound')
          )
        ]
      })
      return
    }

    const { cell } = resolved

    if (cell.kind === 'empty' || cell.kind === 'special') {
      const user = await db.user.findUnique({
        where: { id: interaction.user.id },
        select: { level: true }
      })
      const payload = buildBuildTypeSelectPayload({
        ownerId: interaction.user.id,
        userLevel: user?.level ?? 1,
        landIndex: data.landIndex,
        x: data.x,
        y: data.y,
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    if (cell.kind === 'factory-anchor' && cell.factory) {
      // 앵커 셀을 점유한 공장 row를 찾아 id 해석.
      const factoryRow = await db.factory.findFirst({
        where: {
          userId: interaction.user.id,
          slots: { some: { landId: resolved.land.id } },
          anchorX: data.x,
          anchorY: data.y
        },
        select: {
          id: true,
          type: true,
          grade: true,
          anchorX: true,
          anchorY: true
        }
      })
      if (!factoryRow) {
        await interaction.editReply({
          components: [
            simpleContainer(
              V2_ACCENT.error,
              undefined,
              t('game:common.error.factoryNotFound')
            )
          ]
        })
        return
      }
      const info = await FactoryService.info(db, factoryRow.id)
      const nextCost =
        info.nextUpgradeCost.money !== null &&
        info.nextUpgradeCost.material !== null
          ? {
              money: info.nextUpgradeCost.money,
              material: info.nextUpgradeCost.material.material as MaterialType,
              amount: info.nextUpgradeCost.material.amount
            }
          : null
      const payload = buildFactoryActionMenuPayload({
        ownerId: interaction.user.id,
        factoryId: factoryRow.id,
        landIndex: data.landIndex,
        info,
        nextCost,
        catalogEntry: FACTORY_CATALOG[factoryRow.type],
        t
      })
      await interaction.editReply(
        payload as Parameters<typeof interaction.editReply>[0]
      )
      return
    }

    // factory-body는 버튼 disabled로 도달 불가 — 방어적 기본 응답.
    await interaction.editReply({
      components: [
        simpleContainer(
          V2_ACCENT.info,
          undefined,
          t('game:land.view.cellComingSoon')
        )
      ]
    })
  }
}
