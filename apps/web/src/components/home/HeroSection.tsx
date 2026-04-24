import Link from 'next/link'

/** 랜딩 히어로 — 타이틀, 한줄 설명, CTA 버튼, 통계 수치 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      {/* 블루프린트 격자 배경 */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, transparent, transparent 39px, var(--color-border) 40px),
            repeating-linear-gradient(90deg, transparent, transparent 39px, var(--color-border) 40px)
          `,
        }}
        aria-hidden="true"
      />

      {/* 방사형 빛 */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, oklch(72% 0.18 55 / 0.12), transparent)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
        {/* 배지 */}
        <div className="mb-6 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-gold-dim)] bg-[var(--color-gold-subtle)] px-3 py-1 text-xs font-medium text-[var(--color-gold)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-gold)]" />
            Discord 봇 기반 방치형 게임
          </span>
        </div>

        {/* 타이틀 */}
        <h1 className="mx-auto max-w-3xl text-center text-4xl leading-tight font-bold tracking-tight text-[var(--color-foreground)] sm:text-5xl lg:text-6xl">
          내 손으로 짓는{' '}
          <span
            className="text-[var(--color-gold)]"
            style={{ textShadow: '0 0 40px oklch(72% 0.18 55 / 0.4)' }}
          >
            산업 제국
          </span>
        </h1>

        {/* 서브타이틀 */}
        <p className="mx-auto mt-6 max-w-xl text-center text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          Discord 서버 안에서 공장을 건설하고, 자재를 생산하고, 글로벌 시장에서 거래하세요. 접속하지
          않아도 공장은 계속 돌아갑니다.
        </p>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-gold)] px-6 py-3 text-lg font-medium text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-gold-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] active:scale-[0.98]"
          >
            Discord로 시작하기
          </Link>
          <Link
            href="/docs"
            className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-elevated)] px-6 py-3 text-lg font-medium text-[var(--color-foreground)] transition-colors duration-150 hover:bg-[var(--color-border)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
          >
            게임 가이드
          </Link>
        </div>

        {/* 통계 */}
        <div className="mt-16 grid grid-cols-3 gap-4 border-t border-[var(--color-border)] pt-10">
          {STATS.map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-[var(--color-gold)] sm:text-3xl">
                {stat.value}
              </div>
              <div className="mt-1 text-xs text-[var(--color-muted)] sm:text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const STATS = [
  { value: '11가지', label: '공장 타입' },
  { value: '3단계', label: '티어 시스템' },
  { value: '글로벌', label: '시장 경제' },
]
