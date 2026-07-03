/**
 * `/market sell` 확인 단계 버튼 핸들러 — 판매(ok) · 취소(step_cancel).
 *
 * customId 포맷:
 *  - 판매: `market:sell:ok:<ownerId>:<material>:<quantity>`
 *  - 취소: `market:sell:step_cancel:<ownerId>`
 *
 * 판매 동작:
 * 1. assertInteractionOwner 로 본인 확인
 * 2. deferUpdate() — DB 호출 전 타임아웃 방어
 * 3. UserService.ensure + MarketSellService.sellToGlobal 호출 —
 *    체결 가격은 확인 화면 표시값이 아니라 체결 트랜잭션 시점의
 *    currentPrice (확인 UI 에 변동 가능성 고지됨)
 * 4. editReply: ephemeral 성공 알림
 * 5. followUp: 공개 성공 메시지 + 퀘스트 완료 알림 (Q3 "자재 판매")
 *
 * 취소 동작: deferUpdate + editReply "판매 취소됨" (list 플로우와 동일 규약).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import {
  ContainerBuilder,
  MessageFlags,
  type ButtonInteraction
} from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  MARKET_SELL_OK_PREFIX,
  MARKET_SELL_STEP_CANCEL_PREFIX
} from '@structures/renderers'
import {
  simpleContainer,
  V2_ACCENT,
  v2EditPayload,
  v2PayloadFromContainers
} from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { appendQuestCompletions } from '@utils/questNotifier'
import { resolveMarketErrorMessage } from '@utils/marketErrorKey'
import { localizeMaterial } from '../../utils/enumLocale'
import { MATERIAL_CHOICES } from '../../commands/game/market'
import { MarketSellService } from '../../services/marketSell'
import { UserService } from '../../services/user'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

type ParsedData =
  | {
      action: 'ok'
      ownerId: string
      material: MaterialType
      quantity: string
    }
  | { action: 'cancel'; ownerId: string }

export class MarketSellConfirmButtonHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.Button
    })
  }

  public override parse(
    interaction: ButtonInteraction
  ): ReturnType<InteractionHandler['parse']> {
    // 판매 버튼 — rest = <material>:<quantity>
    const okParsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      MARKET_SELL_OK_PREFIX
    )
    if (okParsed) {
      const parts = okParsed.rest.split(':')
      if (parts.length < 2) return this.none()
      const [material, quantity] = parts
      if (!material || !quantity) return this.none()
      if (!VALID_MATERIALS.has(material)) return this.none()
      if (!/^\d+$/.test(quantity)) return this.none()
      return this.some<ParsedData>({
        action: 'ok',
        ownerId: okParsed.ownerId,
        material: material as MaterialType,
        quantity
      })
    }

    // 취소 버튼 — customId: `market:sell:step_cancel:<ownerId>`
    if (interaction.customId.startsWith(MARKET_SELL_STEP_CANCEL_PREFIX)) {
      const ownerId = interaction.customId.slice(
        MARKET_SELL_STEP_CANCEL_PREFIX.length
      )
      if (!/^\d{5,25}$/.test(ownerId)) return this.none()
      return this.some<ParsedData>({ action: 'cancel', ownerId })
    }

    return this.none()
  }

  public async run(
    interaction: ButtonInteraction,
    data: ParsedData
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)

    if (data.action === 'cancel') {
      await interaction.deferUpdate()
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            t('game:market.sell.stepCancelled')
          )
        ])
      )
      return
    }

    const { db } = this.container
    await interaction.deferUpdate()

    try {
      const quantity = BigInt(data.quantity)

      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketSellService.sellToGlobal(db, {
        userId: interaction.user.id,
        material: data.material,
        quantity,
        guildId: interaction.guildId
      })

      const title = t('game:market.sell.success', {
        material: localizeMaterial(t, result.material),
        quantity: formatBigInt(result.quantity)
      })
      const footer = t('game:market.sell.footer', {
        price: formatBigInt(result.unitPrice),
        total: formatBigInt(result.totalPaid)
      })

      // ephemeral 메시지 업데이트
      await interaction.editReply(
        v2EditPayload([simpleContainer(V2_ACCENT.success, undefined, title)])
      )

      // 공개 성공 메시지 + 퀘스트 완료 알림
      const successContainer = simpleContainer(
        V2_ACCENT.success,
        undefined,
        title,
        footer
      )
      const questEnriched = appendQuestCompletions(
        v2PayloadFromContainers([successContainer]),
        result.quest,
        t
      )
      await interaction.followUp({
        components: questEnriched.components as ContainerBuilder[],
        flags: MessageFlags.IsComponentsV2
      })
    } catch (err) {
      const message = resolveMarketErrorMessage(err, 'sell', t)
      if (!isKnownServiceError(err)) {
        this.container.logger.error(err)
      }
      await interaction.editReply(
        v2EditPayload([simpleContainer(V2_ACCENT.error, undefined, message)])
      )
    }
  }
}

function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}
