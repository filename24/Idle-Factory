import type { LucideIcon } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
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

/**
 * 표에 들어가는 한 줄. 표시 문구는 전부 메시지 키로만 들고 있다 —
 * 아이콘과 티어 구성만 코드에 남기고 번역은 `messages/<locale>.json` 이 갖는다.
 */
interface FactoryEntry {
  icon: LucideIcon
  /** `home.factories.names.<nameKey>` */
  nameKey: string
  /** `home.factories.materials.<inputKey>` */
  inputKey: string
  /** `home.factories.materials.<outputKey>` */
  outputKey: string
}

interface TierData {
  tier: string
  /** `home.factories.tiers.<tierKey>.label` / `.desc` */
  tierKey: string
  factories: FactoryEntry[]
}

/** 공장 티어별 쇼케이스 — 원료 채취부터 완제품까지 3단계 티어를 스펙시트 표로 렌더링 */
export async function FactoryShowcase() {
  const t = await getTranslations('home.factories')

  return (
    <section className="border-hairline border-t py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="mb-12 max-w-2xl">
          <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
            {t('eyebrow')}
          </div>
          <h2 className="font-display text-ink text-2xl break-keep sm:text-3xl">{t('title')}</h2>
          <p className="text-body mt-4 text-base leading-relaxed break-keep">{t('subtitle')}</p>
        </div>

        <div className="space-y-12">
          {TIERS.map((tier) => (
            <div key={tier.tier}>
              <div className="border-hairline mb-4 flex flex-wrap items-center gap-3 border-b pb-4">
                <span className="border-hairline bg-elevated text-body inline-flex items-center rounded border px-2.5 py-1 text-xs">
                  {tier.tier}
                </span>
                <h3 id={`tier-${tier.tier}`} className="font-display text-ink text-xl break-keep">
                  {t(`tiers.${tier.tierKey}.label`)}
                </h3>
                <span className="text-mute text-sm break-keep">
                  {t(`tiers.${tier.tierKey}.desc`)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm" aria-labelledby={`tier-${tier.tier}`}>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        {t('columns.factory')}
                      </th>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        {t('columns.input')}
                      </th>
                      <th
                        scope="col"
                        className="text-mute pb-2.5 text-left text-xs font-medium tracking-wider uppercase"
                      >
                        {t('columns.output')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tier.factories.map((f) => {
                      const Icon = f.icon
                      return (
                        <tr key={f.nameKey}>
                          <td className="border-hairline border-t py-2.5">
                            <span className="flex items-center gap-2.5">
                              <Icon aria-hidden="true" className="text-mute size-4 shrink-0" />
                              <span className="text-ink font-medium break-keep">
                                {t(`names.${f.nameKey}`)}
                              </span>
                            </span>
                          </td>
                          <td className="border-hairline text-charcoal border-t py-2.5 break-keep tabular-nums">
                            {t(`materials.${f.inputKey}`)}
                          </td>
                          <td className="border-hairline text-body border-t py-2.5 break-keep tabular-nums">
                            {t(`materials.${f.outputKey}`)}
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
    tierKey: 't1',
    factories: [
      { icon: Wheat, nameKey: 'farm', inputKey: 'none', outputKey: 'grain' },
      { icon: Pickaxe, nameKey: 'mine', inputKey: 'none', outputKey: 'ore' },
      { icon: TreePine, nameKey: 'lumberyard', inputKey: 'none', outputKey: 'timber' },
      { icon: Fuel, nameKey: 'oilfield', inputKey: 'none', outputKey: 'crudeOil' },
    ],
  },
  {
    tier: 'T2',
    tierKey: 't2',
    factories: [
      { icon: Factory, nameKey: 'steelworks', inputKey: 'ore', outputKey: 'steel' },
      { icon: Wrench, nameKey: 'refinery', inputKey: 'crudeOil', outputKey: 'fuel' },
      { icon: Wheat, nameKey: 'mill', inputKey: 'grain', outputKey: 'processedFood' },
      { icon: Armchair, nameKey: 'furniture', inputKey: 'timber', outputKey: 'furniture' },
    ],
  },
  {
    tier: 'T3',
    tierKey: 't3',
    factories: [
      { icon: Car, nameKey: 'automotive', inputKey: 'steelAndFuel', outputKey: 'car' },
      { icon: Cpu, nameKey: 'electronics', inputKey: 'steelAndPlastic', outputKey: 'electronics' },
      {
        icon: UtensilsCrossed,
        nameKey: 'food',
        inputKey: 'processedFood',
        outputKey: 'packagedFood',
      },
    ],
  },
]
