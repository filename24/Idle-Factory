/**
 * 모든 명령어 실행 전 약관·개인정보 처리방침 동의 여부를 확인하는 전역 precondition.
 *
 * `BotClient` 의 `defaultPreconditions: ['Onboarding']` 에 의해 모든 Command piece 에 자동으로 prepend.
 * 미동의 유저는 명령 실행을 차단당하고, 대신 ephemeral 동의 페이로드(약관/개인정보 링크 + 동의/거부 버튼)를 받는다.
 *
 * 우회 명령 없음 — `/ping` 포함 어떤 명령도 동의 전엔 통과 못 한다(사용자 정책).
 *
 * 참조:
 *  - docs/design/00-onboarding.md §온보딩 동의
 *  - .claude/skills/componentsv2-builder/SKILL.md
 */

import { AllFlowsPrecondition } from '@sapphire/framework'
import { fetchT, type TFunction } from '@sapphire/plugin-i18next'
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type ContextMenuCommandInteraction,
  type InteractionReplyOptions
} from 'discord.js'
import { V2_ACCENT, v2Flags } from '@utils/ComponentsV2'
import {
  ONBOARDING_AGREE_PREFIX,
  ONBOARDING_DECLINE_PREFIX,
  ONBOARDING_DENY_IDENTIFIER,
  ONBOARDING_PROMPT_VERSION,
  PRIVACY_URL,
  TERMS_URL
} from '@utils/Constants'

type GatedInteraction =
  | ChatInputCommandInteraction
  | ContextMenuCommandInteraction

/**
 * 동의 ephemeral 페이로드를 생성한다.
 *
 * 레이아웃:
 *   Container (info accent)
 *     ├── 제목 (`# **이용약관 / 개인정보 처리방침 동의**`)
 *     ├── 본문 (마크다운 안내)
 *     ├── Separator
 *     ├── ActionRow [이용약관 보기 | 개인정보 처리방침 보기]  (Link 버튼)
 *     └── ActionRow [동의하고 시작 | 거부]                    (Success / Secondary)
 */
export function buildConsentPayload(
  t: TFunction,
  ownerId: string
): InteractionReplyOptions {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# **${t('common:onboarding.title')}**`)
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(t('common:onboarding.body'))
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const linksRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(TERMS_URL)
      .setLabel(t('common:onboarding.viewTerms')),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(PRIVACY_URL)
      .setLabel(t('common:onboarding.viewPrivacy'))
  )
  const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `${ONBOARDING_AGREE_PREFIX}${ownerId}:${ONBOARDING_PROMPT_VERSION}`
      )
      .setStyle(ButtonStyle.Success)
      .setLabel(t('common:onboarding.agree')),
    new ButtonBuilder()
      .setCustomId(
        `${ONBOARDING_DECLINE_PREFIX}${ownerId}:${ONBOARDING_PROMPT_VERSION}`
      )
      .setStyle(ButtonStyle.Secondary)
      .setLabel(t('common:onboarding.decline'))
  )
  container.addActionRowComponents(linksRow)
  container.addActionRowComponents(actionRow)

  return { components: [container], flags: v2Flags(true) }
}

/**
 * 동의 페이로드를 ephemeral 로 전송한다. 이미 응답된 인터랙션이면 followUp 으로 폴백.
 * `ButtonInteraction` 도 받아 미래 동의 갱신 흐름에서 재사용 가능.
 */
export async function sendConsentPrompt(
  interaction: GatedInteraction | ButtonInteraction
): Promise<void> {
  const t = await fetchT(interaction)
  const payload = buildConsentPayload(t, interaction.user.id)
  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(payload)
  } else {
    await interaction.reply(payload)
  }
}

export class OnboardingPrecondition extends AllFlowsPrecondition {
  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    return this.check(interaction)
  }

  public override async contextMenuRun(
    interaction: ContextMenuCommandInteraction
  ) {
    return this.check(interaction)
  }

  /** 레거시 prefix 명령은 적용 대상 외(현 봇은 prefix 명령 미사용). */
  public override messageRun() {
    return this.ok()
  }

  private async check(interaction: GatedInteraction) {
    const row = await this.container.db.user.findUnique({
      where: { id: interaction.user.id },
      select: { agreedTermsAt: true, agreedPrivacyAt: true }
    })
    if (row?.agreedTermsAt && row?.agreedPrivacyAt) {
      return this.ok()
    }
    await sendConsentPrompt(interaction)
    return this.error({
      identifier: ONBOARDING_DENY_IDENTIFIER,
      message: 'User has not agreed to terms and privacy.'
    })
  }
}

declare module '@sapphire/framework' {
  interface Preconditions {
    Onboarding: never
  }
}
