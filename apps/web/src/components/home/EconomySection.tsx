import { type LucideIcon, Circle, Coins, LineChart, TrendingDown, TrendingUp } from 'lucide-react'

/** 경제 시스템 소개 섹션 */
export function EconomySection() {
  return (
    <section className="border-hairline border-b">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start lg:gap-20">
          {/* 텍스트 */}
          <div>
            <div className="text-mute mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
              <span className="text-ash">{'//'}</span>
              <span>경제 시스템</span>
            </div>
            <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
              살아있는 경제 시스템
            </h2>
            <p className="text-body mt-4 text-base leading-relaxed break-keep">
              Idle Factory의 시장은 단순한 상점이 아닙니다. 플레이어의 생산과 거래가 가격을
              움직이고, 서버 전체의 신뢰도가 생산성에 영향을 줍니다.
            </p>

            <ul className="border-hairline mt-10 border-t">
              {FEATURES.map((f) => {
                const Icon = TAG_ICONS[f.tag] ?? LineChart
                return (
                  <li
                    key={f.title}
                    className="border-hairline flex items-start gap-5 border-b py-5"
                  >
                    <span className="border-hairline-strong bg-elevated text-ink mt-0.5 flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-widest uppercase">
                      <Icon aria-hidden="true" className="size-3" />
                      {f.tag}
                    </span>
                    <div>
                      <div className="text-ink text-sm font-medium">{f.title}</div>
                      <div className="text-mute mt-1 text-xs leading-relaxed break-keep">
                        {f.desc}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* 시세 패널 — 모노스페이스 마켓 피드 */}
          <div className="border-hairline-strong bg-deep overflow-hidden rounded border">
            <div className="border-hairline flex items-center justify-between border-b px-4 py-3">
              <span className="text-mute flex items-center gap-1.5 text-[10px] tracking-[0.2em] uppercase">
                <LineChart aria-hidden="true" className="size-3.5" />
                Market Feed
              </span>
              <span className="text-accent-green flex items-center gap-1.5 text-[10px] tracking-[0.15em] uppercase">
                <Circle aria-hidden="true" className="size-2 fill-current" />
                Live
              </span>
            </div>

            {METRICS.map((m) => (
              <div
                key={m.label}
                className={`border-hairline flex items-center justify-between border-b border-l-2 px-4 py-5 last:border-b-0 ${m.accentClass}`}
              >
                <div>
                  <div className="text-mute text-[10px] tracking-[0.15em] uppercase">{m.label}</div>
                  <div
                    className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${m.valueClass}`}
                  >
                    {m.value}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`flex items-center justify-end gap-1 text-sm font-medium tabular-nums ${m.changeClass}`}
                  >
                    {m.changeClass === 'text-accent-green' ? (
                      <TrendingUp aria-hidden="true" className="size-3.5" />
                    ) : m.changeClass === 'text-accent-red' ? (
                      <TrendingDown aria-hidden="true" className="size-3.5" />
                    ) : (
                      <Coins aria-hidden="true" className="size-3.5" />
                    )}
                    {m.change}
                  </div>
                  <div className="text-mute mt-0.5 text-[10px]">{m.changeSub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const TAG_ICONS: Record<string, LucideIcon> = {
  MKT: LineChart,
  INV: Coins,
  SRV: TrendingUp,
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
    change: '3.2%',
    changeSub: '24h 변동',
    accentClass: 'border-l-accent-green/60',
    changeClass: 'text-accent-green',
    valueClass: 'text-ink',
  },
  {
    label: '원유 시세',
    value: '₩ 2,105',
    change: '1.7%',
    changeSub: '24h 변동',
    accentClass: 'border-l-accent-red/60',
    changeClass: 'text-accent-red',
    valueClass: 'text-ink',
  },
  {
    label: '서버 신뢰도',
    value: '87%',
    change: '+2pt',
    changeSub: '전일 대비',
    accentClass: 'border-l-hairline-strong',
    changeClass: 'text-accent-green',
    valueClass: 'text-ink',
  },
  {
    label: '활성 공장',
    value: '142',
    change: '가동 중',
    changeSub: '현재 기준',
    accentClass: 'border-l-hairline-strong',
    changeClass: 'text-mute',
    valueClass: 'text-ink',
  },
]
