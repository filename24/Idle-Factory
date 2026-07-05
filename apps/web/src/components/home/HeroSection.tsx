import Link from 'next/link'

import { CodeWindow } from '@/components/ui/CodeWindow'
import { Glow } from '@/components/ui/Glow'

/** 랜딩 히어로 — 아이브로우 배지, 세리프 타이틀, 한줄 설명, CTA 버튼, 예시 커맨드 코드윈도우 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <Glow tone="blue" />

      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          {/* 아이브로우 배지 */}
          <span className="border-hairline bg-elevated text-body inline-flex items-center rounded-full border px-2.5 py-1 text-xs">
            Discord 경제 시뮬레이션
          </span>

          {/* 타이틀 */}
          <h1 className="font-display text-ink mt-6 text-[clamp(2.75rem,7vw,5.5rem)] leading-[1.02] tracking-[-0.02em] break-keep">
            내 손으로 짓는
            <br />
            <span className="italic">산업 제국</span>
          </h1>

          {/* 서브타이틀 */}
          <p className="text-charcoal mx-auto mt-6 max-w-xl text-base leading-relaxed break-keep sm:text-lg">
            Discord 서버 안에서 공장을 건설하고, 자재를 생산하고, 글로벌 시장에서 거래하세요.
            접속하지 않아도 공장은 계속 돌아갑니다.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
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
              게임 가이드
            </Link>
          </div>
        </div>

        {/* 예시 슬래시 커맨드 */}
        <div className="mx-auto mt-16 max-w-2xl">
          <CodeWindow label="Discord">
            <pre>
              <span className="text-mute">{'> '}</span>
              <span className="text-ink">/factory build</span>
              <span className="text-charcoal"> tier:2 slot:3</span>
              {'\n'}
              <span className="text-ash">✓ 2공장 3번 슬롯에 조립 라인을 건설했습니다.</span>
              {'\n\n'}
              <span className="text-mute">{'> '}</span>
              <span className="text-ink">/material sell</span>
              <span className="text-charcoal"> item:철광석 amount:500</span>
              {'\n'}
              <span className="text-ash">✓ 철광석 500개를 글로벌 시장에 즉시 판매했습니다.</span>
            </pre>
          </CodeWindow>
        </div>
      </div>
    </section>
  )
}
