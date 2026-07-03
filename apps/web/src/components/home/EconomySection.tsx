/** 경제 시스템 소개 섹션 */
export function EconomySection() {
  return (
    <section className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start lg:gap-20">
          {/* 텍스트 */}
          <div>
            <div className="mb-2 text-[10px] tracking-[0.25em] text-[var(--color-gold)] uppercase">
              {'// 경제 시스템'}
            </div>
            <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
              살아있는 경제 시스템
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--color-muted-foreground)] sm:text-base">
              Idle Factory의 시장은 단순한 상점이 아닙니다. 플레이어의 생산과 거래가 가격을
              움직이고, 서버 전체의 신뢰도가 생산성에 영향을 줍니다.
            </p>

            <ul className="mt-10 space-y-0 border-t border-[var(--color-border)]">
              {FEATURES.map((f) => (
                <li
                  key={f.title}
                  className="flex items-start gap-5 border-b border-[var(--color-border)] py-5"
                >
                  <span className="mt-0.5 shrink-0 border border-[var(--color-gold-dim)] px-1.5 py-0.5 text-[10px] font-medium tracking-widest text-[var(--color-gold)] uppercase">
                    {f.tag}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-[var(--color-foreground)]">
                      {f.title}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                      {f.desc}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* 시세 패널 — 트레이딩 터미널 스타일 */}
          <div className="border border-[var(--color-border)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
              <span className="text-[10px] tracking-[0.2em] text-[var(--color-muted-foreground)] uppercase">
                Market Feed
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-[var(--color-success)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-success)]" />
                Live
              </span>
            </div>

            {METRICS.map((m, i) => (
              <div
                key={m.label}
                className="relative flex items-center justify-between px-4 py-5"
                style={{
                  borderBottom:
                    i < METRICS.length - 1 ? '1px solid var(--color-border)' : undefined,
                }}
              >
                {/* 좌측 액센트 바 */}
                <div
                  className="absolute top-0 left-0 h-full w-[3px]"
                  style={{ background: m.accentColor }}
                />

                <div className="pl-1">
                  <div className="text-[10px] tracking-[0.15em] text-[var(--color-muted-foreground)] uppercase">
                    {m.label}
                  </div>
                  <div
                    className="mt-1 text-xl font-bold tabular-nums sm:text-2xl"
                    style={{ color: m.valueColor ?? 'var(--color-foreground)' }}
                  >
                    {m.value}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className="text-sm font-medium tabular-nums"
                    style={{ color: m.changeColor }}
                  >
                    {m.change}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                    {m.changeSub}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const FEATURES = [
  {
    tag: 'MKT',
    title: '수급 기반 가격 변동',
    desc: '생산량이 많아지면 가격이 떨어지고, 희소해지면 오릅니다. 시장을 읽는 플레이어가 이깁니다.',
  },
  {
    tag: 'INV',
    title: '주식 & 투자',
    desc: '자재를 직접 생산하기 어렵다면 해당 공장의 주식을 사세요. 수익의 일부가 배당됩니다.',
  },
  {
    tag: 'SRV',
    title: '서버 신뢰도',
    desc: '서버 전체의 생산 효율을 나타냅니다. 플레이어가 활발할수록 모든 공장의 생산량이 올라갑니다.',
  },
]

const METRICS = [
  {
    label: '철강 시세',
    value: '₩ 4,820',
    change: '▲ 3.2%',
    changeSub: '24h 변동',
    accentColor: 'var(--color-success)',
    changeColor: 'var(--color-success)',
    valueColor: undefined,
  },
  {
    label: '원유 시세',
    value: '₩ 2,105',
    change: '▼ 1.7%',
    changeSub: '24h 변동',
    accentColor: 'var(--color-danger)',
    changeColor: 'var(--color-danger)',
    valueColor: undefined,
  },
  {
    label: '서버 신뢰도',
    value: '87%',
    change: '▲ +2pt',
    changeSub: '전일 대비',
    accentColor: 'var(--color-gold)',
    changeColor: 'var(--color-success)',
    valueColor: 'var(--color-gold)',
  },
  {
    label: '활성 공장',
    value: '142',
    change: '가동 중',
    changeSub: '현재 기준',
    accentColor: 'var(--color-border)',
    changeColor: 'var(--color-muted-foreground)',
    valueColor: undefined,
  },
]
