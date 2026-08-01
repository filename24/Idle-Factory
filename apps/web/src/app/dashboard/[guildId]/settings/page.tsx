import type { Metadata } from 'next'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { db } from '@/lib/db'
import { requireGuildAdmin } from '@/lib/guild-admin/authorize'
import { GUILD_LANG_CHOICES, GUILD_TAX_CHOICES } from '@/lib/mutations/guild-settings'
import { GuildSettingForm } from '@/components/guild-admin/GuildSettingForm'
import { EmptyState } from '@/components/common/EmptyState'

/**
 * 서버 설정 콘솔.
 *
 * 이 페이지가 렌더된다는 사실 자체가 인가를 의미하지 않는다 — 각 Server Action
 * 이 `requireGuildAdmin` 을 **다시** 호출한다. 여기서 가드를 부르는 것은
 * "무엇을 그릴지" 정하기 위해서지, 쓰기를 허용하기 위해서가 아니다.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guildAdmin.meta')
  return { title: t('title'), description: t('description') }
}

interface SettingsPageProps {
  readonly params: Promise<{ guildId: string }>
}

export default async function GuildSettingsPage({
  params,
}: SettingsPageProps): Promise<React.ReactElement> {
  const { guildId } = await params
  const authorization = await requireGuildAdmin(guildId)
  const t = await getTranslations('guildAdmin')

  if (!authorization.ok) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
        <EmptyState
          title={t(`errors.${authorization.code}`)}
          description={t(`errorHints.${authorization.code}`)}
        >
          <Link
            href={`/dashboard/${guildId}`}
            className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
          >
            {t('backToStats')}
          </Link>
        </EmptyState>
      </section>
    )
  }

  const guild = await db.guild.findUnique({
    where: { id: authorization.guildId },
    select: { name: true, lang: true, taxSurcharge: true },
  })

  const tLocale = await getTranslations('locale')

  return (
    <section
      aria-labelledby="guild-settings-heading"
      className="mx-auto max-w-2xl space-y-6 px-4 py-10 sm:px-6"
    >
      <header className="space-y-1">
        <Link
          href={`/dashboard/${authorization.guildId}`}
          className="text-ash hover:text-ink text-xs transition-colors"
        >
          ← {t('backToStats')}
        </Link>
        <h1 id="guild-settings-heading" className="font-display text-ink text-2xl">
          {t('title')}
        </h1>
        <p className="text-ash text-sm">{guild?.name ?? authorization.guildId}</p>
      </header>

      <GuildSettingForm
        guildId={authorization.guildId}
        kind="lang"
        currentValue={guild?.lang ?? 'ko'}
        options={GUILD_LANG_CHOICES.map((value) => ({
          value,
          // 봇 로케일 코드(`en-US`)를 웹 라벨 키(`en`)로 옮긴다.
          label: tLocale(value === 'en-US' ? 'en' : value),
        }))}
        label={t('lang.label')}
        description={t('lang.description')}
      />

      <GuildSettingForm
        guildId={authorization.guildId}
        kind="tax"
        currentValue={String(guild?.taxSurcharge ?? 0)}
        options={GUILD_TAX_CHOICES.map((value) => ({
          value: String(value),
          label: `${Math.round(value * 100)}%`,
        }))}
        label={t('tax.label')}
        description={t('tax.description')}
      />
    </section>
  )
}
