/**
 * `/market directbuy` 확인 단계 버튼 핸들러 — 구매(ok) · 취소(step_cancel) (#16).
 *
 * customId 포맷:
 *  - 구매: `market:dbuy:ok:<ownerId>:<material>:<quantity>`
 *  - 취소: `market:dbuy:step_cancel:<ownerId>`
 *
 * 구매 동작:
 * 1. assertInteractionOwner 로 본인 확인
 * 2. deferUpdate() — DB 호출 전 타임아웃 방어
 * 3. UserService.ensure + DirectBuyService.buy — 체결 단가는 확인 화면
 *    표시값이 아니라 체결 트랜잭션 시점의 `currentPrice × 2`
 *    (확인 UI 에 변동 가능성 고지됨)
 * 4. editReply: ephemeral 성공 알림
 * 5. followUp: 공개 성공 메시지 (단가·총액·남은 일일 한도)
 *
 * 취소 동작: deferUpdate + editReply "구매 취소됨" (sell 플로우와 동일 규약).
 * XP·퀘스트 이벤트 없음 — 구매 행위는 XP 미지급 (docs/design/09-level-xp.md).
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import { isDirectBuyMaterial } from '@idle/game-core'
import {
  MARKET_DIRECT_BUY_OK_PREFIX,
  MARKET_DIRECT_BUY_STEP_CANCEL_PREFIX
} from '@structures/renderers'
import {
  simpleContainer,
  V2_ACCENT,
  v2EditPayload,
  v2PayloadFromContainers
} from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { resolveMarketErrorMessage } from '@utils/marketErrorKey'
import { localizeMaterial } from '../../utils/enumLocale'
import { DirectBuyService } from '../../services/directBuy'
import { UserService } from '../../services/user'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'

type ParsedData =
  | {
      action: 'ok'
      ownerId: string
      material: MaterialType
      quantity: string
    }
  | { action: 'cancel'; ownerId: string }

export class MarketDirectBuyConfirmButtonHandler extends InteractionHandler {
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
    // 구매 버튼 — rest = <material>:<quantity>
    const okParsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      MARKET_DIRECT_BUY_OK_PREFIX
    )
    if (okParsed) {
      const parts = okParsed.rest.split(':')
      if (parts.length < 2) return this.none()
      const [material, quantity] = parts
      if (!material || !quantity) return this.none()
      if (!isDirectBuyMaterial(material as MaterialType)) return this.none()
      if (!/^\d+$/.test(quantity)) return this.none()
      return this.some<ParsedData>({
        action: 'ok',
        ownerId: okParsed.ownerId,
        material: material as MaterialType,
        quantity
      })
    }

    // 취소 버튼 — customId: `market:dbuy:step_cancel:<ownerId>`
    if (interaction.customId.startsWith(MARKET_DIRECT_BUY_STEP_CANCEL_PREFIX)) {
      const ownerId = interaction.customId.slice(
        MARKET_DIRECT_BUY_STEP_CANCEL_PREFIX.length
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
            t('game:market.directbuy.stepCancelled')
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
      const result = await DirectBuyService.buy(db, {
        userId: interaction.user.id,
        material: data.material,
        quantity,
        guildId: interaction.guildId
      })

      const title = t('game:market.directbuy.success', {
        material: localizeMaterial(t, result.material),
        quantity: formatBigInt(result.quantity)
      })
      const footer = t('game:market.directbuy.footer', {
        price: formatBigInt(result.unitPrice),
        total: formatBigInt(result.totalCost),
        remaining: result.dailyRemaining.toLocaleString('en-US'),
        limit: result.dailyLimit.toLocaleString('en-US')
      })

      // ephemeral 메시지 업데이트
      await interaction.editReply(
        v2EditPayload([simpleContainer(V2_ACCENT.success, undefined, title)])
      )

      // 공개 성공 메시지 (sell 플로우와 동일 규약 — 경제 이벤트 공개 공유)
      await interaction.followUp(
        v2PayloadFromContainers([
          simpleContainer(V2_ACCENT.success, undefined, title, footer)
        ])
      )
    } catch (err) {
      const message = resolveMarketErrorMessage(err, 'directbuy', t)
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
