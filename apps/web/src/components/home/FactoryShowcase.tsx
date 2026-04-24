import { Badge } from '@/components/ui/Badge'
import type { BadgeVariant } from '@/components/ui/Badge'

interface FactoryEntry {
  icon: string
  name: string
  input: string
  output: string
}

interface TierData {
  tier: string
  label: string
  variant: BadgeVariant
  desc: string
  factories: FactoryEntry[]
}

/** 공장 티어별 쇼케이스 */
export function FactoryShowcase() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
            11가지 공장, 3단계 티어
          </h2>
          <p className="mt-3 text-sm text-[var(--color-muted)] sm:text-base">
            원료 채취부터 완제품 생산까지 — 수직 통합 제국을 구축하세요
          </p>
        </div>

        <div className="space-y-10">
          {TIERS.map((tier) => (
            <div key={tier.tier}>
              <div className="mb-4 flex items-center gap-3">
                <Badge variant={tier.variant} className="px-2 py-0.5 text-sm">
                  {tier.tier}
                </Badge>
                <span className="font-medium text-[var(--color-foreground)]">{tier.label}</span>
                <span className="text-xs text-[var(--color-muted)]">— {tier.desc}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {tier.factories.map((f) => (
                  <div
                    key={f.name}
                    className="group rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-canvas)] p-4 transition-colors duration-150 hover:border-[var(--color-gold-dim)] hover:bg-[var(--color-elevated)]"
                  >
                    <div className="mb-2 text-2xl">{f.icon}</div>
                    <div className="text-sm font-medium text-[var(--color-foreground)]">
                      {f.name}
                    </div>
                    <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-muted)]">
                      <span>{f.input}</span>
                      <span className="text-[var(--color-gold)]">→</span>
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
    variant: 'green',
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
    variant: 'blue',
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
    variant: 'gold',
    desc: 'T2 가공재로 고부가가치 완제품 생산 (2×2 슬롯)',
    factories: [
      { icon: '🚗', name: '자동차 공장', input: '철강+연료', output: '자동차' },
      { icon: '💻', name: '전자 공장', input: '철강+플라스틱', output: '전자제품' },
      { icon: '🍽️', name: '식품 공장', input: '가공식품', output: '완제 식품' },
    ],
  },
]
