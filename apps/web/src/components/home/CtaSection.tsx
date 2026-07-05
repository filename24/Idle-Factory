import Link from 'next/link'

import { Glow } from '@/components/ui/Glow'

/** 하단 CTA 섹션 — Discord 초대 + 문서 링크 */
export function CtaSection() {
  return (
    <section className="relative overflow-hidden py-28 sm:py-40">
      <Glow tone="blue" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="border-hairline-strong bg-surface rounded-2xl border p-8 sm:p-12">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            {/* 텍스트 */}
            <div>
              <div className="text-mute mb-3 text-xs font-medium tracking-[0.18em] uppercase">
                ▶ Start Now
              </div>
              <h2 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
                지금 바로
                <br />
                공장을 시작하세요
              </h2>
              <p className="text-charcoal mt-4 max-w-md text-base leading-relaxed break-keep">
                Discord 서버에 봇을 초대하거나, 게임 가이드를 먼저 읽어보세요.
                <br className="hidden sm:block" />
                계정 연동 없이 봇만 있으면 바로 플레이할 수 있습니다.
              </p>
            </div>

            {/* CTA 버튼 */}
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end xl:flex-row">
              <Link
                href="/login"
                className="bg-primary text-primary-foreground focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 items-center justify-center rounded-lg px-5 text-base font-medium transition-colors hover:bg-[#f1f7fe] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Discord로 시작하기
              </Link>
              <Link
                href="/docs"
                className="border-hairline-strong bg-elevated text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-11 items-center justify-center rounded-lg border px-5 text-base font-medium transition-colors hover:border-white/25 hover:bg-[#16161b] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                게임 가이드 읽기
              </Link>
            </div>
          </div>

          {/* 하단 구분선 + 부연 */}
          <div className="border-hairline mt-16 flex flex-col gap-1 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-mute text-xs">Idle Factory · Discord 기반 방치형 공장 게임</span>
            <span className="text-mute text-xs">무료 플레이 · 설치 불필요</span>
          </div>
        </div>
      </div>
    </section>
  )
}
