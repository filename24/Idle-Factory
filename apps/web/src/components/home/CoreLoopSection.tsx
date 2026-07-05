import { Glow } from '@/components/ui/Glow'

/** 핵심 게임 루프 3단계 섹션 */
export function CoreLoopSection() {
  return (
    <section className="border-hairline relative overflow-hidden border-y">
      <Glow tone="orange" />
      <div className="relative mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
        {/* 섹션 헤더 — 좌정렬 */}
        <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
          {'// 핵심 루프'}
        </div>
        <h2 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
          간단한 3단계, 무한한 전략
        </h2>
        <p className="text-charcoal mt-3 max-w-xl text-base leading-relaxed break-keep">
          복잡한 조작 없이 명령어 하나로 제국을 키워가세요
        </p>

        {/* 단계 카드 그리드 */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="group border-hairline-strong bg-surface rounded-xl border p-8 transition-colors hover:border-white/20"
            >
              {/* 단계 번호 */}
              <div className="border-hairline bg-elevated text-ink flex size-10 items-center justify-center rounded-lg border text-sm font-medium tabular-nums">
                {String(i + 1).padStart(2, '0')}
              </div>

              {/* 내용 */}
              <h3 className="text-ink mt-6 text-xl font-medium tracking-tight">{step.title}</h3>
              <p className="text-charcoal mt-2 text-sm leading-relaxed break-keep">
                {step.description}
              </p>

              {/* 커맨드 힌트 */}
              <div className="mt-6">
                <span className="border-hairline bg-elevated text-mute inline-flex items-center rounded-md border px-2 py-1 font-mono text-[13px] tracking-wider uppercase">
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
