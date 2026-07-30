import { type LucideIcon, Circle, Coins, LineChart, TrendingDown, TrendingUp } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

/** 경제 시스템 소개 섹션 */
export async function EconomySection() {
  const t = await getTranslations('home.economy')

  return (
    <section className="border-hairline border-b">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-start lg:gap-20">
          {/* 텍스트 */}
          <div>
            <div className="text-mute mb-3 flex items-center gap-2 text-xs font-medium tracking-[0.18em] uppercase">
              <span className="text-ash">{'//'}</span>
              <span>{t('eyebrow')}</span>
            </div>
            <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
              {t('title')}
            </h2>
            <p className="text-body mt-4 text-base leading-relaxed break-keep">{t('subtitle')}</p>

            <ul className="border-hairline mt-10 border-t">
              {FEATURES.map((f) => {
                const Icon = TAG_ICONS[f.tag] ?? LineChart
                return (
                  <li key={f.key} className="border-hairline flex items-start gap-5 border-b py-5">
                    <span className="border-hairline-strong bg-elevated text-ink mt-0.5 flex shrink-0 items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-medium tracking-widest uppercase">
                      <Icon aria-hidden="true" className="size-3" />
                      {f.tag}
                    </span>
                    <div>
                      <div className="text-ink text-sm font-medium">
                        {t(`features.${f.key}.title`)}
                      </div>
                      <div className="text-mute mt-1 text-xs leading-relaxed break-keep">
                        {t(`features.${f.key}.desc`)}
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
                key={m.key}
                className={`border-hairline flex items-center justify-between border-b border-l-2 px-4 py-5 last:border-b-0 ${m.accentClass}`}
              >
                <div>
                  <div className="text-mute text-[10px] tracking-[0.15em] uppercase">
                    {t(`metrics.${m.key}.label`)}
                  </div>
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
                    {m.changeKey ? t(`metrics.${m.changeKey}`) : m.change}
                  </div>
                  <div className="text-mute mt-0.5 text-[10px]">
                    {t(`metrics.${m.changeSubKey}`)}
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

const TAG_ICONS: Record<string, LucideIcon> = {
  MKT: LineChart,
  INV: Coins,
  SRV: TrendingUp,
}

/** 표시 문구는 `home.economy.features.<key>` 메시지 키가 단일 진실 소스다. */
const FEATURES = [
  { tag: 'MKT', key: 'market' },
  { tag: 'INV', key: 'invest' },
  { tag: 'SRV', key: 'server' },
]

/**
 * 마켓 피드 데모 수치. 숫자·퍼센트는 로케일과 무관하므로 코드에 남기고,
 * 라벨과 변동 설명만 `home.economy.metrics.*` 키로 뺀다.
 * `changeKey` 가 있으면 change 대신 번역문을 쓴다(숫자가 아닌 문구인 경우).
 */
const METRICS: Array<{
  key: string
  value: string
  change: string
  changeKey?: string
  changeSubKey: string
  accentClass: string
  changeClass: string
  valueClass: string
}> = [
  {
    key: 'steel',
    value: '₩ 4,820',
    change: '3.2%',
    changeSubKey: 'change24h',
    accentClass: 'border-l-accent-green/60',
    changeClass: 'text-accent-green',
    valueClass: 'text-ink',
  },
  {
    key: 'oil',
    value: '₩ 2,105',
    change: '1.7%',
    changeSubKey: 'change24h',
    accentClass: 'border-l-accent-red/60',
    changeClass: 'text-accent-red',
    valueClass: 'text-ink',
  },
  {
    key: 'credit',
    value: '87%',
    change: '+2pt',
    changeSubKey: 'changeVsYesterday',
    accentClass: 'border-l-hairline-strong',
    changeClass: 'text-accent-green',
    valueClass: 'text-ink',
  },
  {
    key: 'factories',
    value: '142',
    change: '',
    changeKey: 'running',
    changeSubKey: 'asOfNow',
    accentClass: 'border-l-hairline-strong',
    changeClass: 'text-mute',
    valueClass: 'text-ink',
  },
]
