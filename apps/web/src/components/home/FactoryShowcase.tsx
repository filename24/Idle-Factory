import type { LucideIcon } from 'lucide-react'
import {
  Armchair,
  Car,
  Cpu,
  Factory,
  Fuel,
  Pickaxe,
  TreePine,
  UtensilsCrossed,
  Wheat,
  Wrench,
} from 'lucide-react'

interface FactoryEntry {
  icon: LucideIcon
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

/** 공장 티어별 쇼케이스 — 원료 채취부터 완제품까지 3단계 티어를 스펙시트 표로 렌더링 */
export function FactoryShowcase() {
  return (
    <section className="border-hairline border-t py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
            {'// 공장 카탈로그'}
          </div>
          <h2 className="font-display text-ink text-2xl break-keep sm:text-3xl">
            11가지 공장, 3단계 티어
          </h2>
          <p className="text-body mt-4 text-base leading-relaxed break-keep">
            원료 채취부터 완제품 생산까지 — 수직 통합 제국을 구축하세요
          </p>
        </div>

        <div className="space-y-12">
          {TIERS.map((tier) => (
            <div key={tier.tier}>
              <div className="border-hairline mb-4 flex flex-wrap items-center gap-3 border-b pb-4">
                <span className="border-hairline bg-elevated text-body inline-flex items-center rounded border px-2.5 py-1 text-xs">
                  {tier.tier}
                </span>
                <h3 id={`tier-${tier.tier}`} className="font-display text-ink text-xl break-keep">
                  {tier.label}
                </h3>
                <span className="text-mute text-sm break-keep">{tier.desc}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-labelledby={`tier-${tier.tier}`}>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        공장
                      </th>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        투입
                      </th>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        산출
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tier.factories.map((f) => {
                      const Icon = f.icon
                      return (
                        <tr key={f.name}>
                          <td className="border-hairline border-t py-2.5">
                            <span className="flex items-center gap-2.5">
                              <Icon aria-hidden="true" className="text-mute size-4 shrink-0" />
                              <span className="text-ink font-medium break-keep">{f.name}</span>
                            </span>
                          </td>
                          <td className="border-hairline text-charcoal border-t py-2.5 break-keep tabular-nums">
                            {f.input}
                          </td>
                          <td className="border-hairline text-body border-t py-2.5 break-keep tabular-nums">
                            {f.output}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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
      { icon: Wheat, name: '농장', input: '—', output: '곡물' },
      { icon: Pickaxe, name: '광산', input: '—', output: '광석' },
      { icon: TreePine, name: '벌목장', input: '—', output: '목재' },
      { icon: Fuel, name: '유전', input: '—', output: '원유' },
    ],
  },
  {
    tier: 'T2',
    label: '1차 가공',
    desc: 'T1 원료를 가공재로 변환',
    factories: [
      { icon: Factory, name: '제철소', input: '광석', output: '철강' },
      { icon: Wrench, name: '정유소', input: '원유', output: '연료' },
      { icon: Wheat, name: '제분소', input: '곡물', output: '가공식품' },
      { icon: Armchair, name: '가구 공장', input: '목재', output: '가구' },
    ],
  },
  {
    tier: 'T3',
    label: '완제품',
    desc: 'T2 가공재로 고부가가치 완제품 생산 (2×2 슬롯)',
    factories: [
      { icon: Car, name: '자동차 공장', input: '철강+연료', output: '자동차' },
      { icon: Cpu, name: '전자 공장', input: '철강+플라스틱', output: '전자제품' },
      { icon: UtensilsCrossed, name: '식품 공장', input: '가공식품', output: '완제 식품' },
    ],
  },
]
