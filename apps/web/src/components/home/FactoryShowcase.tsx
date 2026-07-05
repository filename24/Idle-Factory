import { Glow } from '@/components/ui/Glow'

interface FactoryEntry {
  icon: string
  name: string
  input: string
  output: string
}

interface TierData {
  tier: string
  label: string
  desc: string
  factories: FactoryEntry[]
}

/** 공장 티어별 쇼케이스 */
export function FactoryShowcase() {
  return (
    <section className="relative overflow-hidden py-24 sm:py-32">
      <Glow tone="orange" />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
            {'// 공장 카탈로그'}
          </div>
          <h2 className="font-display text-ink text-4xl leading-[1.05] tracking-[-0.02em] break-keep sm:text-5xl">
            11가지 공장, 3단계 티어
          </h2>
          <p className="text-charcoal mt-4 text-base leading-relaxed break-keep">
            원료 채취부터 완제품 생산까지 — 수직 통합 제국을 구축하세요
          </p>
        </div>

        <div className="space-y-12">
          {TIERS.map((tier) => (
            <div key={tier.tier}>
              <div className="border-hairline mb-5 flex flex-wrap items-center gap-3 border-b pb-4">
                <span className="border-hairline bg-elevated text-body inline-flex items-center rounded-full border px-2.5 py-1 text-xs">
                  {tier.tier}
                </span>
                <span className="text-ink text-xl font-medium tracking-tight">{tier.label}</span>
                <span className="text-mute text-sm break-keep">{tier.desc}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {tier.factories.map((f) => (
                  <div
                    key={f.name}
                    className="group border-hairline-strong bg-surface rounded-xl border p-6 transition-colors hover:border-white/20"
                  >
                    <div className="border-hairline bg-elevated mb-4 flex size-10 items-center justify-center rounded-lg border text-xl">
                      {f.icon}
                    </div>
                    <div className="text-ink text-sm font-medium">{f.name}</div>
                    <div className="text-mute mt-1.5 flex items-center gap-1.5 text-xs">
                      <span>{f.input}</span>
                      <span className="text-ash">→</span>
                      <span>{f.output}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

const TIERS: TierData[] = [
  {
    tier: 'T1',
    label: '원료 채취',
    desc: '자연 자원을 수집하는 기초 공장',
    factories: [
      { icon: '🌾', name: '농장', input: '—', output: '곡물' },
      { icon: '⛏️', name: '광산', input: '—', output: '광석' },
      { icon: '🪵', name: '벌목장', input: '—', output: '목재' },
      { icon: '🛢️', name: '유전', input: '—', output: '원유' },
    ],
  },
  {
    tier: 'T2',
    label: '1차 가공',
    desc: 'T1 원료를 가공재로 변환',
    factories: [
      { icon: '🏭', name: '제철소', input: '광석', output: '철강' },
      { icon: '🔧', name: '정유소', input: '원유', output: '연료' },
      { icon: '🌾', name: '제분소', input: '곡물', output: '가공식품' },
      { icon: '🪑', name: '가구 공장', input: '목재', output: '가구' },
    ],
  },
  {
    tier: 'T3',
    label: '완제품',
    desc: 'T2 가공재로 고부가가치 완제품 생산 (2×2 슬롯)',
    factories: [
      { icon: '🚗', name: '자동차 공장', input: '철강+연료', output: '자동차' },
      { icon: '💻', name: '전자 공장', input: '철강+플라스틱', output: '전자제품' },
      { icon: '🍽️', name: '식품 공장', input: '가공식품', output: '완제 식품' },
    ],
  },
]
