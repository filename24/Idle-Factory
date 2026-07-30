/**
 * 약관·개인정보 동의 버튼 핸들러.
 *
 * customId 포맷:
 *   `onboard:agree:<ownerId>:<schemaVersion>`
 *   `onboard:decline:<ownerId>:<schemaVersion>`
 *
 * 흐름 (agree):
 *  1. owner 검증 (`assertInteractionOwner`).
 *  2. `runInTx` 안에서 `UserService.ensureWithinTx` → 동의 stamp 업데이트 → `QuestService.seedTutorial`.
 *  3. 환영 페이로드 (`/quest` 안내) 로 메시지를 update.
 *
 * 흐름 (decline): DB 무변경, "동의가 필요해요" 안내로 update.
 *
 * 멱등 가드: 이미 동의한 유저가 재클릭해도 환영 페이로드로 점프.
 */

import {
  InteractionHandler,
  InteractionHandlerTypes
} from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import type { ButtonInteraction } from 'discord.js'
import { simpleV2Payload, V2_ACCENT } from '@utils/ComponentsV2'
import {
  CONSENT_VERSIONS,
  ONBOARDING_AGREE_PREFIX,
  ONBOARDING_DECLINE_PREFIX
} from '@utils/Constants'
import {
  assertInteractionOwner,
  parseOwnerPrefixedCustomId
} from '@utils/interactionOwner'
import { QuestService } from '../../services/quest'
import { UserService } from '../../services/user'
import { runInTx } from '../../services/base'

type Action = 'agree' | 'decline'

interface ParsedConsent {
  readonly action: Action
  readonly ownerId: string
}

function parseConsent(customId: string): ParsedConsent | null {
  const agree = parseOwnerPrefixedCustomId(customId, ONBOARDING_AGREE_PREFIX)
  if (agree) return { action: 'agree', ownerId: agree.ownerId }
  const decline = parseOwnerPrefixedCustomId(
    customId,
    ONBOARDING_DECLINE_PREFIX
  )
  if (decline) return { action: 'decline', ownerId: decline.ownerId }
  return null
}

function buildWelcomePayload(t: TFunction) {
  return simpleV2Payload({
    accent: V2_ACCENT.success,
    title: t('common:onboarding.welcome.title'),
    body: t('common:onboarding.welcome.body'),
    ephemeral: true
  })
}

function buildDeclinedPayload(t: TFunction) {
  return simpleV2Payload({
    accent: V2_ACCENT.warn,
    title: t('common:onboarding.declined.title'),
    body: t('common:onboarding.declined.body'),
    ephemeral: true
  })
}

export class OnboardingConsentButtonHandler extends InteractionHandler {
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
    const parsed = parseConsent(interaction.customId)
    if (!parsed) return this.none()
    return this.some(parsed)
  }

  public async run(
    interaction: ButtonInteraction,
    data: ParsedConsent
  ): Promise<void> {
    if (!(await assertInteractionOwner(interaction, data.ownerId))) return

    const t = await fetchT(interaction)
    const { db } = this.container

    if (data.action === 'decline') {
      await interaction.update(
        buildDeclinedPayload(t) as Parameters<typeof interaction.update>[0]
      )
      return
    }

    // 멱등 가드 — 이미 동의된 유저면 곧장 환영 메시지.
    const existing = await db.user.findUnique({
      where: { id: data.ownerId },
      select: { agreedTermsAt: true, agreedPrivacyAt: true }
    })
    if (existing?.agreedTermsAt && existing?.agreedPrivacyAt) {
      await interaction.update(
        buildWelcomePayload(t) as Parameters<typeof interaction.update>[0]
      )
      return
    }

    await interaction.deferUpdate()

    const now = new Date()
    await runInTx(db, async (tx) => {
      await UserService.ensureWithinTx(tx, {
        discordId: data.ownerId,
        nickname: interaction.user.username
      })
      await tx.user.update({
        where: { id: data.ownerId },
        data: {
          agreedTermsAt: now,
          agreedPrivacyAt: now,
          agreedTermsVersion: CONSENT_VERSIONS.terms,
          agreedPrivacyVersion: CONSENT_VERSIONS.privacy
        }
      })
      await QuestService.seedTutorial(tx, data.ownerId)
    })

    await interaction.editReply(
      buildWelcomePayload(t) as Parameters<typeof interaction.editReply>[0]
    )
  }
}
