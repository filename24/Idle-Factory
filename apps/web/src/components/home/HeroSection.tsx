import { Check } from 'lucide-react'
import Link from 'next/link'

import { CodeWindow } from '@/components/ui/CodeWindow'

/** 랜딩 히어로 — 터미널 코멘트 이브로우, 모노 디스플레이 타이틀, 한줄 설명, CTA 버튼, 예시 커맨드 코드윈도우 */
export function HeroSection() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          {/* 이브로우 — 터미널 코멘트 */}
          <p className="text-sm">
            <span className="text-ash">{'// '}</span>
            <span className="text-mute">Discord 경제 시뮬레이션</span>
          </p>

          {/* 타이틀 */}
          <h1 className="font-display text-ink mt-6 text-[clamp(2rem,4vw+1rem,2.75rem)] leading-[1.2] break-keep">
            내 손으로 짓는
            <br />
            산업 제국
          </h1>

          {/* 서브타이틀 */}
          <p className="text-mute mx-auto mt-6 max-w-xl text-base leading-relaxed break-keep">
            Discord 서버 안에서 공장을 건설하고, 자재를 생산하고, 글로벌 시장에서 거래하세요.
            접속하지 않아도 공장은 계속 돌아갑니다.
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="focus-visible:ring-ring focus-visible:ring-offset-canvas bg-accent-blue-btn hover:bg-accent-blue-hover inline-flex h-10 items-center justify-center gap-2 rounded border border-transparent px-5 text-sm font-medium text-white transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Discord로 시작하기
            </Link>
            <Link
              href="/docs"
              className="border-hairline text-charcoal hover:bg-elevated hover:text-ink focus-visible:ring-ring focus-visible:ring-offset-canvas inline-flex h-10 items-center justify-center gap-2 rounded border bg-transparent px-5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              게임 가이드
            </Link>
          </div>
        </div>

        {/* 예시 슬래시 커맨드 */}
        <div className="mx-auto mt-16 max-w-2xl">
          <CodeWindow label="Discord">
            <pre>
              <span className="text-ash">{'> '}</span>
              <span className="text-ink">/factory build</span>
              <span className="text-charcoal"> tier:2 slot:3</span>
              {'\n'}
              <span className="text-accent-green">
                <Check aria-hidden="true" className="inline size-3.5" /> 2공장 3번 슬롯에 조립
                라인을 건설했습니다.
              </span>
              {'\n\n'}
              <span className="text-ash">{'> '}</span>
              <span className="text-ink">/material sell</span>
              <span className="text-charcoal"> item:철광석 amount:500</span>
              {'\n'}
              <span className="text-accent-green">
                <Check aria-hidden="true" className="inline size-3.5" /> 철광석 500개를 글로벌
                시장에 즉시 판매했습니다.
              </span>
            </pre>
          </CodeWindow>
        </div>
      </div>
    </section>
  )
}
