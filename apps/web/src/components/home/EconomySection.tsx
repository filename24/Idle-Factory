/** 경제 시스템 소개 섹션 */
export function EconomySection() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
      <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
        {/* 텍스트 */}
        <div>
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
            살아있는 경제 시스템
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted)] sm:text-base">
            Idle Factory의 시장은 단순한 상점이 아닙니다. 플레이어의 생산과 거래가 가격을 움직이고,
            서버 전체의 신뢰도가 생산성에 영향을 줍니다.
          </p>

          <ul className="mt-8 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] text-base">
                  {f.icon}
                </div>
                <div>
                  <div className="text-sm font-medium text-[var(--color-foreground)]">
                    {f.title}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
                    {f.desc}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* 장식용 지표 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <div className="text-xs text-[var(--color-muted)]">{m.label}</div>
              <div
                className="mt-2 text-xl font-bold"
                style={{ color: m.color ?? 'var(--color-foreground)' }}
              >
                {m.value}
              </div>
              <div className="mt-1 text-xs" style={{ color: m.changeColor }}>
                {m.change}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  {
    icon: '📈',
    title: '수급 기반 가격 변동',
    desc: '생산량이 많아지면 가격이 떨어지고, 희소해지면 오릅니다. 시장을 읽는 플레이어가 이깁니다.',
  },
  {
    icon: '🏦',
    title: '주식 & 투자',
    desc: '자재를 직접 생산하기 어렵다면 해당 공장의 주식을 사세요. 수익의 일부가 배당됩니다.',
  },
  {
    icon: '🌐',
    title: '서버 신뢰도',
    desc: '서버 전체의 생산 효율을 나타냅니다. 플레이어가 활발할수록 모든 공장의 생산량이 올라갑니다.',
  },
]

const METRICS = [
  {
    label: '철강 시세',
    value: '₩ 4,820',
    change: '▲ 3.2%',
    changeColor: 'var(--color-success)',
    color: undefined,
  },
  {
    label: '원유 시세',
    value: '₩ 2,105',
    change: '▼ 1.7%',
    changeColor: 'var(--color-danger)',
    color: undefined,
  },
  {
    label: '서버 신뢰도',
    value: '87%',
    change: '▲ 2포인트',
    changeColor: 'var(--color-success)',
    color: 'var(--color-gold)',
  },
  {
    label: '활성 공장',
    value: '142개',
    change: '현재 가동 중',
    changeColor: 'var(--color-muted)',
    color: undefined,
  },
]
