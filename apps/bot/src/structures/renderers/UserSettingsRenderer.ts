/**
 * 개인 언어 설정 ephemeral 패널 렌더러.
 *
 * `/language` 커맨드와 그 select 핸들러가 동일한 컨테이너를 공유한다. 선택 직후
 * `interaction.update` 로 같은 메시지를 교체하므로, 렌더러는 항상 "현재 저장된
 * 값" 하나만 받아 default 표시를 계산한다.
 *
 * 길드 설정 패널(`GuildSettingsRenderer`)과 나란한 구조지만 대상이 다르다 —
 * 이쪽은 서버 관리자가 아니라 유저 본인의 설정이며, 서버 설정을 그대로 따르는
 * `'auto'` 선택지가 하나 더 있다.
 */

import {
  ActionRowBuilder,
  ContainerBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder
} from 'discord.js'
import type { TFunction } from '@sapphire/plugin-i18next'
import { V2_ACCENT } from '@utils/ComponentsV2'
import { USER_SETTINGS_LANG_PREFIX } from '@utils/Constants'
import {
  LANGUAGE_LABELS,
  LANG_AUTO,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage
} from '@utils/language'

/** 패널 렌더에 필요한 최소 유저 상태. */
export interface UserLanguageView {
  /** 패널 소유자 snowflake — customId 에 박아 타인 조작을 막는다. */
  readonly userId: string
  /** 현재 저장된 `User.lang` (`'auto'` 또는 지원 로케일). */
  readonly lang: string
}

/**
 * 현재 설정값을 사람이 읽을 수 있는 라벨로 바꾼다.
 *
 * `'auto'` 는 "서버 설정 따름"으로 번역해 보여주고, 지원 로케일은 endonym 을
 * 그대로 쓴다. DB 에 남은 미지원 값은 정체를 숨기지 않고 원본을 노출한다.
 */
function currentLangLabel(lang: string, t: TFunction): string {
  if (lang === LANG_AUTO) return t('embeds:userSettings.autoLabel')
  return isSupportedLanguage(lang) ? LANGUAGE_LABELS[lang] : lang
}

/**
 * 개인 언어 설정 패널 컨테이너를 만든다.
 *
 * 레이아웃:
 *   Container (info accent)
 *     ├── 제목 (`# **🌐 언어 설정**`)
 *     ├── 본문 (현재 값 + 우선순위 안내)
 *     ├── Separator
 *     └── ActionRow [언어 select]
 *
 * @param view 패널 소유자와 현재 저장값
 * @param t 대상 로케일 `t` 함수
 */
export function buildUserSettingsContainer(
  view: UserLanguageView,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('embeds:userSettings.title')}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('embeds:userSettings.body', {
        lang: currentLangLabel(view.lang, t)
      })
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# ${t('embeds:userSettings.footer')}`)
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const autoOption = new StringSelectMenuOptionBuilder()
    .setLabel(t('embeds:userSettings.autoLabel'))
    .setValue(LANG_AUTO)
    .setDefault(view.lang === LANG_AUTO)

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId(`${USER_SETTINGS_LANG_PREFIX}${view.userId}`)
    .setPlaceholder(t('embeds:userSettings.langPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions([
      autoOption,
      ...SUPPORTED_LANGUAGES.map((lang) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(LANGUAGE_LABELS[lang])
          .setValue(lang)
          .setDefault(view.lang === lang)
      )
    ])

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(langSelect)
  )

  return container
}
