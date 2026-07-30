import { ArrowLeftRight, Cog, Hammer } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { FeatureList } from '@/components/ui/FeatureList'

/** 핵심 게임 루프 3단계 섹션 */
export async function CoreLoopSection() {
  const t = await getTranslations('home.loop')

  return (
    <section className="border-hairline border-y">
      <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 sm:py-28">
        {/* 섹션 헤더 — 좌정렬 */}
        <div className="text-mute mb-2 text-xs font-medium tracking-[0.18em] uppercase">
          {t('eyebrow')}
        </div>
        <h2 className="font-display text-ink text-2xl leading-tight break-keep sm:text-3xl">
          {t('title')}
        </h2>
        <p className="text-charcoal mt-3 max-w-xl text-base leading-relaxed break-keep">
          {t('subtitle')}
        </p>

        {/* 단계 목록 */}
        <div className="mt-12">
          <FeatureList
            divided
            items={STEPS.map((step) => ({
              icon: step.icon,
              name: t(`steps.${step.key}.title`),
              description: (
                <>
                  {t(`steps.${step.key}.description`)}{' '}
                  <span className="border-hairline bg-elevated text-mute mt-1 inline-flex items-center rounded border px-2 py-0.5 align-middle font-mono text-[13px] tracking-wider uppercase">
                    {step.cmd}
                  </span>
                </>
              ),
            }))}
          />
        </div>
      </div>
    </section>
  )
}

/** 단계 구조 — 표시 문구는 `home.loop.steps.<key>` 메시지 키가 단일 진실 소스다. */
const STEPS = [
  { key: 'build', cmd: '/build', icon: <Hammer className="size-5" /> },
  { key: 'produce', cmd: '/status', icon: <Cog className="size-5" /> },
  { key: 'trade', cmd: '/market', icon: <ArrowLeftRight className="size-5" /> },
]
