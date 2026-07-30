/**
 * 길드 설정 ephemeral 패널 렌더러.
 *
 * guildCreate 메시지의 [⚙️ 서버 설정] 버튼 클릭 또는 `/setup` 같은 후속 진입점에서
 * 동일하게 사용한다. 각 SelectMenu 는 현재 값에 default 표시.
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
import type { Guild as GuildRow } from '@idle/database'
import type { TFunction } from '@sapphire/plugin-i18next'
import { V2_ACCENT } from '@utils/ComponentsV2'
import {
  GUILD_SETTINGS_LANG_PREFIX,
  GUILD_SETTINGS_TAX_PREFIX
} from '@utils/Constants'
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from '@utils/language'

/**
 * 설정 가능한 언어 — 번역 리소스 목록을 그대로 따른다.
 *
 * 별도 배열로 복제하면 `src/locales/` 에 언어를 추가했을 때 한쪽만 늘어나
 * "고를 수는 있는데 번역이 없는" 상태가 된다. 단일 진실 소스에서 파생한다.
 */
export const GUILD_LANG_CHOICES: readonly string[] = SUPPORTED_LANGUAGES

/** 설정 가능한 세율 (0~0.20, 5% 단위). docs/07 §세금·정산. */
export const GUILD_TAX_CHOICES: readonly number[] = [0, 0.05, 0.1, 0.15, 0.2]

const LANG_LABELS: Record<string, string> = LANGUAGE_LABELS

/**
 * 길드 설정 패널 컨테이너를 만든다.
 *
 * 레이아웃:
 *   Container (info accent)
 *     ├── 제목 (`# **⚙️ 서버 설정**`)
 *     ├── 본문 (현재 값 안내)
 *     ├── Separator
 *     ├── ActionRow [언어 select]
 *     └── ActionRow [세율 select]
 */
export function buildGuildSettingsContainer(
  guildRow: GuildRow,
  t: TFunction
): ContainerBuilder {
  const container = new ContainerBuilder().setAccentColor(V2_ACCENT.info)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# **${t('embeds:guildSettings.title')}**`
    )
  )
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      t('embeds:guildSettings.body', {
        lang: LANG_LABELS[guildRow.lang] ?? guildRow.lang,
        tax: (guildRow.taxSurcharge * 100).toFixed(0)
      })
    )
  )
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  )

  const langSelect = new StringSelectMenuBuilder()
    .setCustomId(`${GUILD_SETTINGS_LANG_PREFIX}${guildRow.id}`)
    .setPlaceholder(t('embeds:guildSettings.langPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      GUILD_LANG_CHOICES.map((lang) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(LANG_LABELS[lang] ?? lang)
          .setValue(lang)
          .setDefault(lang === guildRow.lang)
      )
    )

  const taxSelect = new StringSelectMenuBuilder()
    .setCustomId(`${GUILD_SETTINGS_TAX_PREFIX}${guildRow.id}`)
    .setPlaceholder(t('embeds:guildSettings.taxPlaceholder'))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      GUILD_TAX_CHOICES.map((rate) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${(rate * 100).toFixed(0)}%`)
          .setValue(rate.toFixed(2))
          .setDefault(Math.abs(rate - guildRow.taxSurcharge) < 1e-9)
      )
    )

  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(langSelect)
  )
  container.addActionRowComponents(
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(taxSelect)
  )

  return container
}
