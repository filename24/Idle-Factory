/** 핵심 게임 루프 3단계 섹션 */
export function CoreLoopSection() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        {/* 섹션 헤더 — 좌정렬 */}
        <div className="mb-2 text-[10px] tracking-[0.25em] text-[var(--color-gold)] uppercase">
          {'// 핵심 루프'}
        </div>
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
          간단한 3단계, 무한한 전략
        </h2>
        <p className="mt-3 max-w-xl text-sm text-[var(--color-muted-foreground)] sm:text-base">
          복잡한 조작 없이 명령어 하나로 제국을 키워가세요
        </p>

        {/* 단계 목록 */}
        <div className="mt-12 border-t border-[var(--color-border)]">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="group flex items-start gap-6 border-b border-[var(--color-border)] py-8 sm:gap-12"
            >
              {/* 단계 번호 */}
              <div className="w-16 shrink-0 leading-none font-bold text-[var(--color-gold)] opacity-30 transition-opacity duration-150 group-hover:opacity-100 sm:w-24">
                <span className="text-5xl tabular-nums sm:text-6xl">
                  {String(i + 1).padStart(2, '0')}
                </span>
              </div>

              {/* 내용 */}
              <div className="pt-1 sm:pt-2">
                <h3 className="text-base font-semibold text-[var(--color-foreground)] sm:text-lg">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
                  {step.description}
                </p>
              </div>

              {/* 커맨드 힌트 */}
              <div className="ml-auto hidden shrink-0 self-center lg:block">
                <span className="border border-[var(--color-border)] px-2 py-1 text-[10px] tracking-wider text-[var(--color-muted-foreground)] uppercase">
                  {step.cmd}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const STEPS = [
  {
    title: '토지 구매 & 공장 건설',
    description:
      '서버 화폐로 토지를 구입하고 슬롯에 T1~T3 공장을 배치하세요. 특수 슬롯은 보너스를 제공합니다.',
    cmd: '/build',
  },
  {
    title: '자동 생산',
    description:
      '공장은 24시간 쉬지 않고 자재를 생산합니다. 업그레이드할수록 생산 효율이 기하급수적으로 증가합니다.',
    cmd: '/status',
  },
  {
    title: '마켓 거래',
    description:
      '글로벌 마켓에서 자재를 사고팔아 수익을 극대화하세요. 수급에 따라 가격이 실시간으로 변동됩니다.',
    cmd: '/market',
  },
]
