import Link from 'next/link'
import { ServerCrash } from 'lucide-react'

/** 서버 대시보드 404 — 존재하지 않거나 형식이 잘못된 서버 ID. */
export default function GuildNotFound(): React.ReactElement {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-20 text-center sm:px-6">
      <ServerCrash aria-hidden="true" className="text-mute size-8" />
      <h1 className="font-display text-ink text-2xl break-keep">서버를 찾을 수 없습니다</h1>
      <p className="text-mute max-w-sm text-sm break-keep">
        존재하지 않거나 봇이 참여하지 않는 서버입니다.
      </p>
      <Link
        href="/ranking?scope=guilds"
        className="text-link hover:text-link-hover text-sm underline-offset-2 hover:underline"
      >
        서버 랭킹 보기
      </Link>
    </section>
  )
}
