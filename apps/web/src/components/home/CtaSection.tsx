import Link from 'next/link'

/** 하단 CTA 섹션 — Discord 초대 + 문서 링크 */
export function CtaSection() {
  return (
    <section className="border-t border-[var(--color-border)]">
      <div className="relative overflow-hidden">
        {/* 배경 그라디언트 */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 50% 100%, oklch(72% 0.18 55 / 0.08), transparent)',
          }}
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
            지금 바로 공장을 시작하세요
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
            Discord 서버에 봇을 초대하거나, 게임 가이드를 먼저 읽어보세요. 계정 연동 없이 봇만
            있으면 바로 플레이할 수 있습니다.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-gold)] px-6 py-3 text-base font-medium text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-gold-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
            >
              <span>⚙️</span>
              Discord로 시작하기
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-gold-dim)] px-6 py-3 text-base font-medium text-[var(--color-gold)] transition-colors duration-150 hover:bg-[var(--color-gold-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
            >
              게임 가이드 읽기
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
