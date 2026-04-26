import Link from 'next/link'

/** 랜딩 히어로 — 타이틀, 한줄 설명, CTA 버튼, 통계 수치 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* 블루프린트 격자 배경 */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 39px, var(--color-border) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, var(--color-border) 40px)
          `,
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-20 sm:px-6 sm:pt-28 sm:pb-28">
        {/* 타이틀 */}
        <h1 className="mx-auto max-w-3xl text-center text-4xl leading-tight font-bold tracking-tight break-keep text-[var(--color-foreground)] sm:text-5xl lg:text-6xl">
          내 손으로 짓는{' '}
          <span className="inline-block whitespace-nowrap text-[var(--color-gold)]">산업 제국</span>
        </h1>

        {/* 서브타이틀 */}
        <p className="mx-auto mt-6 max-w-xl text-center text-sm leading-relaxed text-[var(--color-muted-foreground)] sm:text-base">
          Discord 서버 안에서 공장을 건설하고, 자재를 생산하고, 글로벌 시장에서 거래하세요. 접속하지
          않아도 공장은 계속 돌아갑니다.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-gold)] px-6 py-3 text-base font-medium text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-gold-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            Discord로 시작하기
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-transparent px-6 py-3 text-base font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:border-[var(--color-gold-dim)] hover:bg-[var(--color-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            게임 가이드
          </Link>
        </div>
      </div>
    </section>
  )
}
