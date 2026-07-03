import { Badge } from '@/components/ui/badge'

type GameTierColor = 'gold' | 'green' | 'blue'

const tierColorClass: Record<GameTierColor, string> = {
  gold: 'border-[var(--color-gold-dim)] text-[var(--color-gold)] bg-[var(--color-gold-subtle)]',
  green:
    'border-[oklch(65%_0.18_145/0.4)] text-[var(--color-success)] bg-[oklch(65%_0.18_145/0.15)]',
  blue: 'border-[oklch(65%_0.18_250/0.4)] text-[oklch(70%_0.18_250)] bg-[oklch(65%_0.18_250/0.15)]',
}

interface FactoryEntry {
  icon: string
  name: string
  input: string
  output: string
}

interface TierData {
  tier: string
  label: string
  color: GameTierColor
  desc: string
  factories: FactoryEntry[]
}

/** 공장 티어별 쇼케이스 */
export function FactoryShowcase() {
  return (
    <section className="border-y border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="mb-12">
          <div className="mb-2 text-[10px] tracking-[0.25em] text-[var(--color-gold)] uppercase">
            {'// 공장 카탈로그'}
          </div>
          <h2 className="text-2xl font-bold text-[var(--color-foreground)] sm:text-3xl">
            11가지 공장, 3단계 티어
          </h2>
          <p className="mt-3 max-w-xl text-sm text-[var(--color-muted-foreground)] sm:text-base">
            원료 채취부터 완제품 생산까지 — 수직 통합 제국을 구축하세요
          </p>
        </div>

        <div className="space-y-10">
          {TIERS.map((tier) => {
            const isT3 = tier.tier === 'T3'
            return (
              <div
                key={tier.tier}
                className={
                  isT3
                    ? 'rounded-[var(--radius-lg)] border border-[var(--color-gold-dim)] bg-[var(--color-gold-subtle)] p-5'
                    : ''
                }
              >
                <div className="mb-4 flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className={`px-2 py-0.5 text-sm ${tierColorClass[tier.color]}`}
                  >
                    {tier.tier}
                  </Badge>
                  <span className="font-medium text-[var(--color-foreground)]">{tier.label}</span>
                  <span className="text-xs text-[var(--color-muted-foreground)]">{tier.desc}</span>
                </div>
                <div
                  className={`grid gap-3 sm:grid-cols-2 ${isT3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}
                >
                  {tier.factories.map((f) => (
                    <div
                      key={f.name}
                      className={`group rounded-[var(--radius-lg)] border p-4 transition-colors duration-150 ${
                        isT3
                          ? 'border-[var(--color-gold-dim)] bg-[var(--color-canvas)] hover:bg-[var(--color-elevated)]'
                          : 'border-[var(--color-border)] bg-[var(--color-canvas)] hover:border-[var(--color-gold-dim)] hover:bg-[var(--color-elevated)]'
                      }`}
                    >
                      <div className="mb-2 text-2xl">{f.icon}</div>
                      <div className="text-sm font-medium text-[var(--color-foreground)]">
                        {f.name}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                        <span>{f.input}</span>
                        <span className="text-[var(--color-gold)]">→</span>
                        <span>{f.output}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const TIERS: TierData[] = [
  {
    tier: 'T1',
    label: '원료 채취',
    color: 'green',
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
    color: 'blue',
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
    color: 'gold',
    desc: 'T2 가공재로 고부가가치 완제품 생산 (2×2 슬롯)',
    factories: [
      { icon: '🚗', name: '자동차 공장', input: '철강+연료', output: '자동차' },
      { icon: '💻', name: '전자 공장', input: '철강+플라스틱', output: '전자제품' },
      { icon: '🍽️', name: '식품 공장', input: '가공식품', output: '완제 식품' },
    ],
  },
]
