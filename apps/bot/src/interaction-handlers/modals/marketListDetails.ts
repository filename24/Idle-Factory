/**
 * `/market list` Modal 제출 핸들러.
 *
 * customId 포맷: `market:list:details:<material>`
 *
 * 동작:
 * 1. customId 에서 material 추출 + enum 검증
 * 2. TextInput 값 파싱 (quantity: bigint, pricePerUnit: bigint, durationDays: number)
 * 3. 파싱 실패 시 ephemeral 오류 응답 (서비스 호출 없이 즉시 반환)
 * 4. UserService.ensure() + MarketService.list() 호출
 * 5. 성공 시 buildListingSuccessContainer 로 공개 응답 + 퀘스트 알림 첨부
 * 6. ServiceError 시 resolveMarketErrorMessage 로 ephemeral 오류 응답
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT } from '@sapphire/plugin-i18next'
import { type ContainerBuilder, type ModalSubmitInteraction } from 'discord.js'
import type { MaterialType } from '@idle/game-core'
import {
  simpleContainer,
  simpleV2Payload,
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
  MATERIAL_CHOICES,
  buildListingSuccessContainer
} from '../../commands/game/market'
import { MARKET_LIST_MODAL_PREFIX } from '../buttons/marketListDuration'

const VALID_MATERIALS = new Set<string>(MATERIAL_CHOICES)

interface ParseSuccess {
  ok: true
  quantity: bigint
  pricePerUnit: bigint
  durationDays: number
}
interface ParseFailure {
  ok: false
  field: 'invalidQuantity' | 'invalidPrice' | 'invalidDuration'
}

function parseModalInputs(
  quantityRaw: string,
  priceRaw: string,
  durationRaw: string
): ParseSuccess | ParseFailure {
  if (!/^\d+$/.test(quantityRaw)) {
    return { ok: false, field: 'invalidQuantity' }
  }
  if (!/^\d+$/.test(priceRaw)) {
    return { ok: false, field: 'invalidPrice' }
  }
  const durationDays = Number.parseInt(durationRaw, 10)
  if (
    !Number.isInteger(durationDays) ||
    durationDays < 1 ||
    durationDays > 30
  ) {
    return { ok: false, field: 'invalidDuration' }
  }

  let quantity: bigint
  let pricePerUnit: bigint
  try {
    quantity = BigInt(quantityRaw)
    pricePerUnit = BigInt(priceRaw)
  } catch {
    return { ok: false, field: 'invalidQuantity' }
  }

  if (quantity < 1n) return { ok: false, field: 'invalidQuantity' }
  if (pricePerUnit < 1n) return { ok: false, field: 'invalidPrice' }

  return { ok: true, quantity, pricePerUnit, durationDays }
}

export class MarketListDetailsModalHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.ModalSubmit
    })
  }

  public override parse(interaction: ModalSubmitInteraction) {
    if (!interaction.customId.startsWith(MARKET_LIST_MODAL_PREFIX)) {
      return this.none()
    }
    // 포맷: market:list:details:<material>:<days>
    // <days> = "3" | "7" | "14" | "30" | "custom"
    const rest = interaction.customId.slice(MARKET_LIST_MODAL_PREFIX.length)
    const lastColon = rest.lastIndexOf(':')
    if (lastColon === -1) return this.none()
    const material = rest.slice(0, lastColon)
    const daysStr = rest.slice(lastColon + 1)

    if (!VALID_MATERIALS.has(material)) return this.none()

    if (daysStr === 'custom') {
      return this.some({
        material: material as MaterialType,
        durationDays: null,
        isCustomDuration: true
      })
    }

    const days = Number.parseInt(daysStr, 10)
    if (!Number.isInteger(days) || days < 1 || days > 30) return this.none()
    return this.some({
      material: material as MaterialType,
      durationDays: days,
      isCustomDuration: false
    })
  }

  public async run(
    interaction: ModalSubmitInteraction,
    data: {
      material: MaterialType
      durationDays: number | null
      isCustomDuration: boolean
    }
  ): Promise<void> {
    const { db } = this.container
    const t = await fetchT(interaction)

    const quantityRaw = interaction.fields.getTextInputValue('quantity').trim()
    const priceRaw = interaction.fields
      .getTextInputValue('price_per_unit')
      .trim()
    const durationRaw = data.isCustomDuration
      ? interaction.fields.getTextInputValue('duration').trim()
      : String(data.durationDays)

    const parsed = parseModalInputs(quantityRaw, priceRaw, durationRaw)
    if (!parsed.ok) {
      // 파싱 실패는 DB 호출 전이므로 직접 ephemeral reply 가능.
      await interaction.reply(
        simpleV2Payload({
          accent: V2_ACCENT.error,
          body: t(`game:market.list.modal.error.${parsed.field}`),
          ephemeral: true
        })
      )
      return
    }

    const { quantity, pricePerUnit, durationDays } = parsed

    // DB 호출 전 defer — 3초 타임아웃 방어.
    // deferReply 이후엔 ephemeral 변경 불가이므로 서비스 오류도 public 응답.
    await interaction.deferReply()

    try {
      await UserService.ensure(db, { discordId: interaction.user.id })
      const result = await MarketService.list(db, {
        userId: interaction.user.id,
        material: data.material,
        quantity,
        pricePerUnit,
        durationDays
      })

      const taxRate = result.listing.taxRate ?? 0
      const container = buildListingSuccessContainer({
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
        v2PayloadFromContainers([container]),
        result.quest,
        t
      )
      await interaction.editReply(
        v2EditPayload(questEnriched.components as ContainerBuilder[])
      )
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
}

function isKnownServiceError(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === 'ServiceError' &&
    typeof (err as { code?: unknown }).code === 'string'
  )
}
