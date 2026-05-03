/**
 * `/market list` 확인 단계 버튼 핸들러 — 등록(ok) · 취소(step_cancel).
 *
 * customId 포맷:
 *  - 등록: `market:list:ok:<ownerId>:<material>:<days>:<quantity>:<price>`
 *  - 취소: `market:list:step_cancel:<ownerId>`
 *
 * 등록 동작:
 * 1. assertInteractionOwner 로 본인 확인
 * 2. deferUpdate() — DB 호출 전 타임아웃 방어
 * 3. UserService.ensure + MarketService.list 호출
 * 4. editReply: ephemeral 성공 알림
 * 5. followUp: 공개 성공 메시지 (buildListingSuccessContainer + 퀘스트 알림)
 *
 * 취소 동작:
 * 1. assertInteractionOwner
 * 2. deferUpdate + editReply: "취소됨" ephemeral
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
  simpleContainer,
  V2_ACCENT,
  v2EditPayload,
  v2PayloadFromContainers
} from '@utils/ComponentsV2'
import { formatBigInt } from '@structures/renderers'
import { appendQuestCompletions } from '@utils/questNotifier'
import { resolveMarketErrorMessage } from '@utils/marketErrorKey'
import { localizeMaterial } from '../../utils/enumLocale'
import { MarketService } from '../../services/market'
import { UserService } from '../../services/user'
import {
  buildListingSuccessContainer,
  MATERIAL_CHOICES
} from '../../commands/game/market'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '../../utils/interactionOwner'
import {
  MARKET_LIST_OK_PREFIX,
  MARKET_LIST_STEP_CANCEL_PREFIX
} from '../selects/marketListPrice'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)
const VALID_DAYS = new Set(['3', '7', '14', '30'])

type ParsedData =
  | {
      action: 'ok'
      ownerId: string
      material: MaterialType
      days: string
      quantity: string
      price: string
    }
  | { action: 'cancel'; ownerId: string }

export class MarketListConfirmButtonHandler extends InteractionHandler {
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
    // 등록 버튼
    const okParsed = parseOwnerPrefixedCustomId(
      interaction.customId,
      MARKET_LIST_OK_PREFIX
    )
    if (okParsed) {
      // rest = <material>:<days>:<quantity>:<price>
      const parts = okParsed.rest.split(':')
      if (parts.length < 4) return this.none()
      const [material, days, quantity, ...priceParts] = parts
      if (!material || !days || !quantity) return this.none()
      if (!VALID_MATERIALS.has(material)) return this.none()
      if (!VALID_DAYS.has(days)) return this.none()
      if (!/^\d+$/.test(quantity)) return this.none()
      const price = priceParts.join(':')
      if (!price || !/^\d+$/.test(price)) return this.none()
      return this.some<ParsedData>({
        action: 'ok',
        ownerId: okParsed.ownerId,
        material: material as MaterialType,
        days,
        quantity,
        price
      })
    }

    // 취소 버튼 — customId: `market:list:step_cancel:<ownerId>`
    if (interaction.customId.startsWith(MARKET_LIST_STEP_CANCEL_PREFIX)) {
      const ownerId = interaction.customId.slice(
        MARKET_LIST_STEP_CANCEL_PREFIX.length
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

    if (data.action === 'cancel') {
      await interaction.deferUpdate()
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.warn,
            undefined,
            this.resolveT(
              await fetchT(interaction),
              'game:market.list.stepCancelled'
            )
          )
        ])
      )
      return
    }

    // 등록 처리
    const { db } = this.container
    const t = await fetchT(interaction)

    await interaction.deferUpdate()

    try {
      const quantity = BigInt(data.quantity)
      const pricePerUnit = BigInt(data.price)
      const durationDays = Number.parseInt(data.days, 10)

      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketService.list(db, {
        userId: interaction.user.id,
        material: data.material,
        quantity,
        pricePerUnit,
        durationDays
      })

      // ephemeral 메시지 업데이트
      await interaction.editReply(
        v2EditPayload([
          simpleContainer(
            V2_ACCENT.success,
            undefined,
            t('game:market.list.success', {
              material: localizeMaterial(t, data.material),
              quantity: formatBigInt(quantity),
              price: formatBigInt(pricePerUnit)
            })
          )
        ])
      )

      // 공개 성공 메시지
      const taxRate = result.listing.taxRate ?? 0
      const successContainer = buildListingSuccessContainer({
        listingId: result.listing.id,
        cancelLabel: t('game:market.list.successButtons.cancel'),
        title: t('game:market.list.success', {
          material: localizeMaterial(t, data.material),
          quantity: formatBigInt(quantity),
          price: formatBigInt(pricePerUnit)
        }),
        footer: t('game:market.list.footer', {
          tax: (taxRate * 100).toFixed(0),
          id: result.listing.id
        })
      })

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
      const message = resolveMarketErrorMessage(err, 'list', t)
      if (!isKnownServiceError(err)) {
        this.container.logger.error(err)
      }
      await interaction.editReply(
        v2EditPayload([simpleContainer(V2_ACCENT.error, undefined, message)])
      )
    }
  }

  private resolveT(t: Awaited<ReturnType<typeof fetchT>>, key: string): string {
    return t(key) as string
  }
}

function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}
