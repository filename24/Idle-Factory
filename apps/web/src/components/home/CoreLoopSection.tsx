/** 핵심 게임 루프 3단계 섹션 */
export function CoreLoopSection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="mb-12 text-center">
        <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
          간단한 3단계, 무한한 전략
        </h2>
        <p className="mt-3 text-sm text-[var(--color-muted)] sm:text-base">
          복잡한 조작 없이 명령어 하나로 제국을 키워가세요
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 sm:gap-0">
        {STEPS.map((step, i) => (
          <div key={step.title} className="relative flex flex-col items-center text-center">
            {/* 연결선 (모바일 제외) */}
            {i < STEPS.length - 1 && (
              <div
                className="absolute top-10 left-[calc(50%+3rem)] hidden h-px w-[calc(100%-6rem)] bg-gradient-to-r from-[var(--color-border)] to-transparent sm:block"
                aria-hidden="true"
              />
            )}

            {/* 아이콘 */}
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-3xl">
              {step.icon}
              <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-gold)] text-xs font-bold text-[var(--color-canvas)]">
                {i + 1}
              </span>
            </div>

            <div className="mt-5 px-4">
              <h3 className="font-semibold text-[var(--color-foreground)]">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                {step.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const STEPS = [
  {
    icon: '🏗️',
    title: '토지 구매 & 공장 건설',
    description:
      '서버 화폐로 토지를 구입하고 슬롯에 T1~T3 공장을 배치하세요. 특수 슬롯은 보너스를 제공합니다.',
  },
  {
    icon: '⚙️',
    title: '자동 생산',
    description:
      '공장은 24시간 쉬지 않고 자재를 생산합니다. 업그레이드할수록 생산 효율이 기하급수적으로 증가합니다.',
  },
  {
    icon: '💰',
    title: '마켓 거래',
    description:
      '글로벌 마켓에서 자재를 사고팔아 수익을 극대화하세요. 수급에 따라 가격이 실시간으로 변동됩니다.',
  },
]
