import Link from 'next/link'

/** 하단 CTA 섹션 — Discord 초대 + 문서 링크 */
export function CtaSection() {
  return (
    <section className="bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          {/* 텍스트 */}
          <div>
            <div className="mb-2 text-[10px] tracking-[0.25em] text-[var(--color-gold)] uppercase">
              ▶ Start Now
            </div>
            <h2 className="text-3xl leading-tight font-bold text-[var(--color-foreground)] sm:text-4xl">
              지금 바로
              <br />
              공장을 시작하세요
            </h2>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--color-muted-foreground)] sm:text-base">
              Discord 서버에 봇을 초대하거나, 게임 가이드를 먼저 읽어보세요.
              <br className="hidden sm:block" />
              계정 연동 없이 봇만 있으면 바로 플레이할 수 있습니다.
            </p>
          </div>

          {/* CTA 버튼 */}
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-end xl:flex-row">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-gold)] px-7 py-3.5 text-base font-medium text-[var(--color-canvas)] transition-colors duration-150 hover:bg-[var(--color-gold-dim)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
            >
              Discord로 시작하기
            </Link>
            <Link
              href="/docs"
              className="inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-gold-dim)] px-7 py-3.5 text-base font-medium text-[var(--color-gold)] transition-colors duration-150 hover:bg-[var(--color-gold-subtle)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)]"
            >
              게임 가이드 읽기
            </Link>
          </div>
        </div>

        {/* 하단 구분선 + 부연 */}
        <div className="mt-16 flex flex-col gap-1 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-[var(--color-muted-foreground)]">
            Idle Factory · Discord 기반 방치형 공장 게임
          </span>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            무료 플레이 · 설치 불필요
          </span>
        </div>
      </div>
    </section>
  )
}
