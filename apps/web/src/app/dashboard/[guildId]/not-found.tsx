import Link from 'next/link'
import { ServerCrash } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/** 서버 대시보드 404 — 존재하지 않거나 형식이 잘못된 서버 ID. */
export default async function GuildNotFound(): Promise<React.ReactElement> {
  const t = await getTranslations('dashboard.guild.notFound')

  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <ServerCrash aria-hidden="true" className="text-mute size-8" />
      <h1 className="font-display text-ink text-2xl break-keep">{t('title')}</h1>
      <p className="text-mute max-w-sm text-sm break-keep">{t('description')}</p>
      <Link
        href="/ranking?scope=guilds"
        className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
      >
        {t('action')}
      </Link>
    </section>
  )
}
