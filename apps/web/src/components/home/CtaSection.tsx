import { Check } from 'lucide-react'
import Link from 'next/link'

import { CodeWindow } from '@/components/ui/CodeWindow'

/** 하단 CTA 섹션 — Discord 초대 + 문서 링크 */
export function CtaSection() {
  return (
    <section className="border-hairline border-t py-20 sm:py-28">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <div className="text-mute mb-3 text-xs font-medium tracking-[0.18em] uppercase">
          <span className="text-ash">{'// '}</span>Start Now
        </div>
        <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
          지금 바로
          <br />
          공장을 시작하세요
        </h2>
        <p className="text-charcoal mx-auto mt-4 max-w-md text-base leading-relaxed break-keep">
          Discord 서버에 봇을 초대하거나, 게임 가이드를 먼저 읽어보세요.
          <br className="hidden sm:block" />
          계정 연동 없이 봇만 있으면 바로 플레이할 수 있습니다.
        </p>

        <CodeWindow label="Discord" className="mt-10 text-left">
          <p>
            <span className="text-ash">&gt; </span>
            <span className="text-ink">/invite</span>{' '}
            <span className="text-charcoal">idle-factory</span>
          </p>
          <p className="text-accent-green mt-1">
            <Check aria-hidden="true" className="inline size-3.5" /> 봇이 서버에 추가되었습니다
          </p>
          <p className="mt-3">
            <span className="text-ash">&gt; </span>
            <span className="text-ink">/factory build</span>{' '}
            <span className="text-charcoal">farm</span>
          </p>
          <p className="text-accent-green mt-1">
            <Check aria-hidden="true" className="inline size-3.5" /> 농장 건설을 시작합니다
          </p>
        </CodeWindow>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="border-hairline-strong bg-canvas text-ink hover:bg-elevated focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-10 items-center justify-center gap-2 rounded border px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Discord로 시작하기
          </Link>
          <Link
            href="/docs"
            className="border-hairline text-charcoal hover:bg-elevated hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-10 items-center justify-center gap-2 rounded border bg-transparent px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            게임 가이드 읽기
          </Link>
        </div>

        {/* 하단 부연 */}
        <div className="border-hairline mt-16 flex flex-col gap-1 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="text-mute">Idle Factory · Discord 기반 방치형 공장 게임</span>
          <span className="text-mute">무료 플레이 · 설치 불필요</span>
        </div>
      </div>
    </section>
  )
}
